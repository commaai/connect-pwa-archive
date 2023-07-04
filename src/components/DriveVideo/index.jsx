/* eslint-disable camelcase */
import React, { Component, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import debounce from 'debounce';
import Obstruction from 'obstruction';
import ReactPlayer from 'react-player/file';

import { video as Video } from '@commaai/api';

import Colors from '../../colors';
import { currentOffset } from '../../timeline';
import { seek, bufferVideo } from '../../timeline/playback';
import { updateSegments } from '../../timeline/segments';

const VideoOverlay = ({ loading, error }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutlineIcon className="mb-2" />
        <Typography>{error}</Typography>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
  } else {
    return;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
}

const DebugBuffer = ({ player }) => {
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!player) return;
    const onTimeUpdate = () => setCurrentTime(player.currentTime);
    player.addEventListener('timeupdate', onTimeUpdate);
    return () => player.removeEventListener('timeupdate', onTimeUpdate);
  }, [player]);

  if (!player) {
    return;
  }

  const { buffered, duration } = player;
  const length = (secs) => `${100 * secs / duration}%`;

  // console.log(player ? {
  //   buffered, duration, currentTime,
  // } : undefined);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-4 bg-red-500 overflow-hidden">
      {Array.from({ length: buffered.length }).map((_, i) => (
        <div
          key={i}
          className="h-full bg-green-500 absolute"
          style={{
            width: length(buffered.end(i) - buffered.start(i)),
            left: length(buffered.start(i)),
          }}
        />
      ))}
      <div className="h-full bg-blue-500 absolute" style={{ left: length(currentTime), width: "1%" }} />
    </div>
  );
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.visibleRoute = this.visibleRoute.bind(this);
    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.syncVideo = debounce(this.syncVideo.bind(this), 200);
    this.firstSeek = true;

    this.videoPlayer = React.createRef();

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    const { playSpeed } = this.props;
    if (this.videoPlayer.current) {
      this.videoPlayer.current.playbackRate = playSpeed || 1;
    }
    this.updateVideoSource({});
    this.syncVideo();
    this.videoSyncIntv = setInterval(this.syncVideo, 250);
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.syncVideo();
  }

  componentWillUnmount() {
    if (this.videoSyncIntv) {
      clearTimeout(this.videoSyncIntv);
      this.videoSyncIntv = null;
    }
  }

  visibleRoute(props = this.props) {
    const offset = currentOffset();
    const { currentRoute } = props;
    if (currentRoute && currentRoute.offset <= offset && offset <= currentRoute.offset + currentRoute.duration) {
      return currentRoute;
    }
    return null;
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const r = this.visibleRoute();
    if (!r) {
      if (src !== '') {
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    const prevR = this.visibleRoute(prevProps);
    if (src === '' || !prevR || prevR.fullname !== r.fullname) {
      src = Video.getQcameraStreamUrl(r.fullname, r.share_exp, r.share_sig);
      this.setState({ src, videoError: null });
      this.syncVideo();
    }
  }

  onVideoBuffering() {
    const { dispatch } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !this.visibleRoute() || !videoPlayer.getDuration()) {
      dispatch(bufferVideo(true));
      console.debug('buffering (150)');
    }

    if (this.firstSeek) {
      this.firstSeek = false;
      videoPlayer.seekTo(this.currentVideoTime(), 'seconds');
    }

    const hasSufficientBuffer = videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() > 30;
    if (!hasSufficientBuffer || videoPlayer.getInternalPlayer().readyState < 2) {
      dispatch(bufferVideo(true));
      console.debug('buffering (162)');
    }
  }

  /**
   * @param {Error} e
   */
  onHlsError(e) {
    console.debug('onHlsError', { e });

    dispatch(bufferVideo(true));
    console.debug('buffering (173)');
    if (e.type === 'mediaError' && e.details === 'bufferStalledError') {
      // buffer but no error
      return;
    }

    this.setState({ videoError: 'Unable to load video' });
  }

  /**
   * @param {Error} e
   * @param {any} [data]
   */
  onVideoError(e, data) {
    if (!e) {
      console.warn('Unknown video error', { e, data });
      return;
    }

    if (e === 'hlsError') {
      this.onHlsError(data);
      return;
    }

    console.debug('onVideoError', { e, data });

    if (e.name === 'AbortError') {
      // ignore
      return;
    }

    if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
      // TODO: figure out why the src isn't set properly
      // Sometimes an error will be thrown because we try to play
      // src: "https://connect.comma.ai/.../undefined"
      console.warn('Video error with undefined src, ignoring', { e, data });
      return;
    }

    const { dispatch } = this.props;
    dispatch(bufferVideo(true));
    console.debug('buffering (213)');

    if (e.type === 'networkError') {
      console.error('Network error', { e, data });
      this.setState({ videoError: 'Unable to load video. Check network connection.'});
      return;
    }

    const videoError = e.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (e.response?.text || 'Unable to load video');
    this.setState({ videoError });
  }

  onVideoResume(source) {
    const { dispatch } = this.props;
    dispatch(bufferVideo(false));
    console.debug(`stop buffering (230, ${source})`);
    this.setState({ videoError: null });
  }

  syncVideo() {
    const { dispatch, isBufferingVideo, routes } = this.props;
    if (!this.visibleRoute()) {
      dispatch(updateSegments());
      if (routes && isBufferingVideo) {
        console.debug('stop buffering (241)');
        dispatch(bufferVideo(false));
      }
      return;
    }

    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getInternalPlayer() || !videoPlayer.getDuration()) {
      return;
    }

    const internalPlayer = videoPlayer.getInternalPlayer();
    console.debug('syncVideo', {
      loaded: videoPlayer.getSecondsLoaded(),
      current: videoPlayer.getCurrentTime(),
      buffer: videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime(),
      sufficientBuffer: videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() >= 30,
      internalPlayer: videoPlayer.getInternalPlayer('hls'),
    });

    // sanity check required for ios
    const sufficientBuffer = Math.min(videoPlayer.getDuration() - videoPlayer.getCurrentTime(), 30);
    const hasSufficientBuffer = videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() >= sufficientBuffer;
    if (hasSufficientBuffer && internalPlayer.readyState >= 2 && isBufferingVideo) {
      console.debug('stop buffering (265)');
      dispatch(bufferVideo(false));
    }
    if (!isBufferingVideo && videoPlayer.getCurrentTime() >= videoPlayer.getSecondsLoaded()) {
      dispatch(bufferVideo(true));
      console.debug('buffering (270)');
    }

    let { desiredPlaySpeed: newPlaybackRate } = this.props;
    const desiredVideoTime = this.currentVideoTime();
    const curVideoTime = videoPlayer.getCurrentTime();
    const timeDiff = desiredVideoTime - curVideoTime;
    if (Math.abs(timeDiff) <= 0.3) {
      newPlaybackRate = Math.max(0, newPlaybackRate + timeDiff);
    } else if (desiredVideoTime === 0 && timeDiff < 0 && curVideoTime !== videoPlayer.getDuration()) {
      // logs start earlier than video, so skip to video ts 0
      dispatch(seek(currentOffset() - (timeDiff * 1000)));
    } else {
      videoPlayer.seekTo(desiredVideoTime, 'seconds');
    }

    newPlaybackRate = Math.round(newPlaybackRate * 10) / 10;
    const playerPlaybackRate = internalPlayer.paused ? 0 : internalPlayer.playbackRate;

    if (internalPlayer.paused && newPlaybackRate !== 0 && hasSufficientBuffer) {
      const playPromise = internalPlayer.play();
      if (playPromise) {
        playPromise.catch((e) => console.warn('play was interrupted', { e }));
      }
    } else if (newPlaybackRate === 0 && !internalPlayer.paused) {
      internalPlayer.pause();
    }

    if (playerPlaybackRate !== newPlaybackRate && newPlaybackRate !== 0) {
      internalPlayer.playbackRate = newPlaybackRate;
    }
  }

  currentVideoTime(offset = currentOffset()) {
    const visibleRoute = this.visibleRoute();
    if (!visibleRoute) {
      return 0;
    }
    offset -= visibleRoute.offset;

    if (visibleRoute.videoStartOffset) {
      offset -= visibleRoute.videoStartOffset;
    }

    offset /= 1000;

    return Math.max(0, offset);
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo } = this.props;
    const { src, videoError } = this.state;
    const videoPlayer = this.videoPlayer.current;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <ReactPlayer
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted
          width="100%"
          height="unset"
          playing={Boolean(this.visibleRoute() && desiredPlaySpeed)}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              enableWorker: false,
              maxBufferLength: 40,
            },
          }}
          playbackRate={desiredPlaySpeed}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={() => this.onVideoResume('onBufferEnd')}
          onStart={() => this.onVideoResume('onStart')}
          onPlay={() => this.onVideoResume('onPlay')}
          onError={this.onVideoError}
        />
        <DebugBuffer player={videoPlayer?.getInternalPlayer()} />
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  desiredPlaySpeed: 'desiredPlaySpeed',
  offset: 'offset',
  startTime: 'startTime',
  isBufferingVideo: 'isBufferingVideo',
  routes: 'routes',
  currentRoute: 'currentRoute',
});

export default connect(stateToProps)(DriveVideo);

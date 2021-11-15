/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles, Typography, CircularProgress } from '@material-ui/core';
import raf from 'raf';
import debounce from 'debounce';
import Obstruction from 'obstruction';
import ReactPlayer from 'react-player'
import Hls from '@commaai/hls.js';
import * as Sentry from '@sentry/react';

import { video as VideoApi } from '@commaai/comma-api';

import { seek, bufferVideo, currentOffset } from '../../timeline/playback';
import { updateSegments } from '../../timeline/segments';

window.Hls = Hls;

const styles = () => ({
  hidden: {
    display: 'none'
  },
  videoContainer: {
    minHeight: 200,
    position: 'relative',
    maxWidth: 964,
    margin: '0 auto',
  },
  videoImage: {
    height: 'auto',
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 1
  },
  bufferingContainer: {
    zIndex: 50,
    position: 'absolute',
    height: '100%',
    width: '100%',
    backgroundColor: '#16181Aaa',
  },
  bufferingSpinner: {
    position: 'relative',
    textAlign: 'center',
    top: 'calc(50% - 25px)',
  },
  bufferingText: {
    position: 'relative',
    textAlign: 'center',
    top: '50%',
  },
});

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.updatePreview = this.updatePreview.bind(this);
    this.visibleSegment = this.visibleSegment.bind(this);
    this.isVideoBuffering = this.isVideoBuffering.bind(this);

    this.videoPlayer = React.createRef();

    this.frame = 0;

    this.state = {
      src: null,
    };
  }

  componentDidMount() {
    const { playSpeed } = this.props;
    if (this.videoPlayer.current) {
      this.videoPlayer.current.playbackRate = playSpeed || 1;
    }
    this.rafLoop = raf(this.updatePreview);
    this.updateVideoSource({});
    this.syncVideo();
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.syncVideo();
  }

  componentWillUnmount() {
    if (this.rafLoop) {
      raf.cancel(this.rafLoop);
      this.rafLoop = null;
    }
  }

  visibleSegment(props = this.props) {
    if (props.currentSegment) {
      return props.currentSegment;
    }
    const offset = currentOffset();
    if (props.nextSegment && props.nextSegment.startOffset - offset < 5000) {
      return props.nextSegment;
    }
    return null;
  }

  updateVideoSource(prevProps) {
    const segment = this.visibleSegment();
    if (!segment) {
      if (this.state.src !== '') {
        this.setState({ src: '' });
      }
      return;
    }

    const prevSegment = this.visibleSegment(prevProps);
    if (this.state.src === '' || !prevSegment || prevSegment.route !== segment.route) {
      let videoApi = VideoApi(segment.url, '');
      videoApi.getQcameraStreamIndex().then(() => {
        let src = videoApi.getQcameraStreamIndexUrl() + `?s=${segment.cameraStreamSegCount}`
        if (src !== this.state.src) {
          this.setState({src});
          this.syncVideo();
        }
      }).catch((err) => {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'drive_video_source_get_qcam_index' });
      });
    }
  }

  updatePreview() {
    // schedule next run right away so that we can return early
    this.rafLoop = raf(this.updatePreview);

    this.frame++;
    if (this.frame % 20 === 0) {
      this.syncVideo();
    }
  }

  isVideoBuffering() {
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !this.visibleSegment() || !videoPlayer.getDuration()) {
      this.props.dispatch(bufferVideo(true));
    }

    const hasSufficientBuffer = videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() > 30;
    if (!hasSufficientBuffer || videoPlayer.getInternalPlayer().readyState < 2) {
      this.props.dispatch(bufferVideo(true));
    }
  }

  syncVideo = debounce(() => {
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getDuration()) {
      return;
    }

    if (!this.visibleSegment()) {
      this.props.dispatch(updateSegments());
      return;
    }

    const offset = currentOffset();
    if (offset > this.visibleSegment().routeOffset + this.visibleSegment().duration || offset < this.visibleSegment().routeOffset) {
      this.props.dispatch(updateSegments());
    }

    const internalPlayer = videoPlayer.getInternalPlayer();

    // sanity check required for ios
    const hasSufficientBuffer = videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() > 30;
    if (hasSufficientBuffer && internalPlayer.readyState >= 2 && this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(false));
    }

    let newPlaybackRate = this.props.desiredPlaySpeed;
    let desiredVideoTime = this.currentVideoTime();
    const curVideoTime = videoPlayer.getCurrentTime();
    const timeDiff = desiredVideoTime - curVideoTime;
    if (Math.abs(timeDiff) <= 0.3) {
      newPlaybackRate = Math.max(0, newPlaybackRate + timeDiff)
    } else if (desiredVideoTime === 0 && timeDiff < 0 && curVideoTime !== videoPlayer.getDuration()) {
      // logs start ealier than video, so skip to video ts 0
      this.props.dispatch(seek(currentOffset() - (timeDiff * 1000)));
    } else {
      videoPlayer.seekTo(desiredVideoTime, 'seconds');
    }

    newPlaybackRate = Math.round(newPlaybackRate * 10) / 10;
    if (internalPlayer.playbackRate !== newPlaybackRate) {
      internalPlayer.playbackRate = newPlaybackRate;
    }

    // pausing and unpausing is required on some browsers
    if (internalPlayer.paused && internalPlayer.playbackRate !== 0 && hasSufficientBuffer) {
      const playRes = internalPlayer.play();
      if (playRes) {
        playRes.catch(() => console.log('play interrupted by pause'));
      }
    } else if (!internalPlayer.paused && internalPlayer.playbackRate === 0) {
      internalPlayer.pause();
    }
  }, 100)

  currentVideoTime(offset = currentOffset()) {
    const visibleSegment = this.visibleSegment();
    if (!visibleSegment) {
      return 0;
    }
    offset -= visibleSegment.routeOffset;
    offset -= visibleSegment.routeFirstSegment * 60000;
    offset = offset / 1000;

    return Math.max(0, offset);
  }

  render() {
    const { classes, isBufferingVideo } = this.props;
    const playSpeed = this.props.desiredPlaySpeed;
    return (
      <div className={ classes.videoContainer }>
        { isBufferingVideo &&
          <div className={ classes.bufferingContainer }>
            <div className={ classes.bufferingSpinner }>
              <CircularProgress color="secondary" thickness={ 6 } size={ 50 } />
            </div>
            <div className={ classes.bufferingText }>
              <Typography>Buffering video</Typography>
            </div>
          </div>
        }
        <ReactPlayer ref={ this.videoPlayer } url={ this.state.src } playsinline={ true } muted={ true }
          width="100%" height="unset" playing={ Boolean(this.visibleSegment()) && Boolean(playSpeed) }
          config={{ hlsOptions: { enableWorker: false, disablePtsDtsCorrectionInMp4Remux: false } }}
          playbackRate={ playSpeed }
          onBuffer={ () => this.isVideoBuffering() }
          onBufferEnd={ () => this.props.dispatch(bufferVideo(false)) }
          onPlay={ () => this.props.dispatch(bufferVideo(false)) } />
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  currentSegment: 'currentSegment',
  nextSegment: 'nextSegment',
  desiredPlaySpeed: 'desiredPlaySpeed',
  offset: 'offset',
  startTime: 'startTime',
  isBufferingVideo: 'isBufferingVideo',
});

export default connect(stateToProps)(withStyles(styles)(DriveVideo));

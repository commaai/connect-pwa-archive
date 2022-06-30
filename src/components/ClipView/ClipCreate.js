import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { withStyles, Typography, TextField, Button, CircularProgress } from '@material-ui/core';
import { clips as ClipsApi } from '@commaai/comma-api';
import ErrorIcon from '@material-ui/icons/ErrorOutline';

import ResizeHandler from '../ResizeHandler';
import DriveVideo from '../DriveVideo';
import Timeline from '../Timeline';
import TimeDisplay from '../TimeDisplay';
import Colors from '../../colors';
import { clipsCreate } from '../../actions/clips';

const styles = (theme) => ({
  clipOption: {
    marginTop: 12,
    width: '100%',
    '& h4': {
      color: Colors.white,
      margin: '0 0 5px 0',
      fontSize: '1rem',
    },
  },
  videoTypeOptions: {
    display: 'flex',
    width: 'max-content',
    alignItems: 'center',
    display: 'flex',
  },
  videoTypeOption: {
    height: 32,
    width: 84,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: `1px solid ${Colors.white10}`,
    borderRight: 'none',
    '&.selected': {
      backgroundColor: Colors.grey950,
    },
    '&:first-child': {
      borderRadius: '16px 0 0 16px',
    },
    '&:last-child': {
      borderRadius: '0 16px 16px 0',
      borderRight: `1px solid ${Colors.white10}`,
    },
  },
  clipTitleInput: {
    '& div': {
      border: `1px solid ${Colors.white10}`,
    },
    '& input': {
      padding: '6px 16px',
    },
  },
  overviewBlockError: {
    borderRadius: 12,
    marginBottom: 12,
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    color: Colors.white,
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  buttons: {
    width: '100%',
    maxWidth: 400,
    height: 42,
    borderRadius: 21,
    background: Colors.white,
    color: Colors.grey900,
    textTransform: 'none',
    '&:hover': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    },
    '&:disabled': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    },
    '&:disabled:hover': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    }
  },
});

class ClipCreate extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      videoTypeOption: 'f',
      isPublic: false,
      clipTitle: null,
      createLoading: false,
      error: null,
    };

    this.onResize = this.onResize.bind(this);
    this.onClipCreate = this.onClipCreate.bind(this);
  }

  async onClipCreate() {
    const { videoTypeOption, clipTitle, isPublic } = this.state;
    const { loop, currentSegment } = this.props;
    if (loop.duration > 300000) {  // 5 minutes
      this.setState({ error: 'clip selection exceeds maximum length of 5 minutes' });
      return;
    }

    this.setState({ createLoading: true });
    try {
      const resp = await ClipsApi.clipsCreate(currentSegment.route, clipTitle, loop.startTime, loop.startTime + loop.duration,
        videoTypeOption, isPublic);
      if (resp && resp.success) {
        this.props.dispatch(clipsCreate(resp.clip_id, videoTypeOption, clipTitle, isPublic));
      } else if (resp.error == 'too_many_pending') {
        this.setState({ error: 'you already have a clip pending, please wait for it to complete', createLoading: false });
      } else {
        this.setState({ error: 'failed to create clip', createLoading: false });
        console.log(resp);
      }
    } catch (err) {
      this.setState({ error: 'unable to create clip', createLoading: false });
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'clips_fetch_details' });
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes } = this.props;
    const { windowWidth, videoTypeOption, clipTitle, isPublic, createLoading, error } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32

    return <>
      <ResizeHandler onResize={ this.onResize } />
      <Timeline className={classes.headerTimeline} thumbnailsVisible={ true } hasClip />
      <div style={{ padding: viewerPadding }}>
        <DriveVideo />
        <div className={ classes.clipOption }>
          <TimeDisplay isThin />
        </div>
        <div className={ classes.clipOption }>
          <h4>Video type</h4>
          <div className={classes.videoTypeOptions}>
            <div className={ `${classes.videoTypeOption} ${videoTypeOption === 'f' ? 'selected' : ''}` }
              onClick={ () => this.setState({ videoTypeOption: 'f' }) }>
              <Typography className={classes.mediaOptionText}>Front</Typography>
            </div>
            <div className={ `${classes.videoTypeOption} ${videoTypeOption === 'e' ? 'selected' : ''}` }
              onClick={ () => this.setState({ videoTypeOption: 'e' }) }>
              <Typography className={classes.mediaOptionText}>Wide</Typography>
            </div>
            <div className={ `${classes.videoTypeOption} ${videoTypeOption === 'd' ? 'selected' : ''}` }
              onClick={ () => this.setState({ videoTypeOption: 'd' }) }>
              <Typography className={classes.mediaOptionText}>Cabin</Typography>
            </div>
          </div>
        </div>
        <div className={ classes.clipOption }>
          <h4>Clip title</h4>
          <TextField className={ classes.clipTitleInput } value={ clipTitle ? clipTitle : '' }
            onChange={ (ev) =>this.setState({ clipTitle: ev.target.value }) } />
        </div>
        <div className={ classes.clipOption }>
          <h4>Availability</h4>
          <div className={classes.videoTypeOptions}>
            <div className={ `${classes.videoTypeOption} ${!isPublic ? 'selected' : ''}` }
              onClick={ () => this.setState({ isPublic: false }) }>
              <Typography className={classes.mediaOptionText}>Private</Typography>
            </div>
            <div className={ `${classes.videoTypeOption} ${isPublic ? 'selected' : ''}` }
              onClick={ () => this.setState({ isPublic: true }) }>
              <Typography className={classes.mediaOptionText}>Public</Typography>
            </div>
          </div>
        </div>
        <div className={ classes.clipOption }>
          { error && <div className={ classes.overviewBlockError }>
            <ErrorIcon />
            <Typography>{ error }</Typography>
          </div> }
          <Button className={classes.buttons} onClick={ this.onClipCreate }
            disabled={ createLoading }>
            { createLoading ?
              <CircularProgress style={{ margin: 0, color: Colors.white }} size={ 19 } /> :
              'Create clip' }
          </Button>
        </div>
      </div>
    </>;
  }
}

const stateToProps = Obstruction({
  currentSegment: 'currentSegment',
  dongleId: 'dongleId',
  clips: 'clips',
  loop: 'loop',
});

export default connect(stateToProps)(withStyles(styles)(ClipCreate));

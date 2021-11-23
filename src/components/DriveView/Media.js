import React, { Component } from 'react';
import qs from 'query-string';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { withStyles, Divider, Typography, Menu, MenuItem } from '@material-ui/core';

import { raw as RawApi } from '@commaai/comma-api';
import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';
import ResizeHandler from '../ResizeHandler';
import * as Demo from '../../demo';
import TimeDisplay from '../TimeDisplay';
import { currentOffset } from '../../timeline/playback';

const demoFiles = require('../../demo/files.json');

const styles = (theme) => ({
  root: {
    display: 'flex',
  },
  mediaOptionsRoot: {
    maxWidth: 964,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  mediaOptions: {
    marginBottom: 12,
    display: 'flex',
    width: 'max-content',
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 50,
    display: 'flex',
  },
  mediaOption: {
    alignItems: 'center',
    borderRight: '1px solid rgba(255,255,255,.1)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    cursor: 'pointer',
    minHeight: 32,
    minWidth: 44,
    paddingLeft: 15,
    paddingRight: 15,
    '&.disabled': {
      cursor: 'default',
    },
    '&:last-child': {
      borderRight: 'none',
    },
  },
  mediaOptionDisabled: {
    cursor: 'auto',
  },
  mediaOptionIcon: {
    backgroundColor: '#fff',
    borderRadius: 3,
    height: 20,
    margin: '2px 0',
    width: 30,
  },
  mediaOptionText: {
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center',
  },
  mediaSource: {
    width: '100%',
  },
  mediaSourceSelect: {
    width: '100%',
  },
  timeDisplay: {
    marginTop: 12,
  },
});

const MediaType = {
  VIDEO: 'video',
  MAP: 'map'
};

class Media extends Component {
  constructor(props) {
    super(props);

    this.state = {
      inView: MediaType.VIDEO,
      windowWidth: window.innerWidth,
      downloadMenu: null,
      moreInfoMenu: null,
    };

    this.renderMediaOptions = this.renderMediaOptions.bind(this);
    this.renderMenus = this.renderMenus.bind(this);
    this.copySegmentName = this.copySegmentName.bind(this);
    this.downloadSegmentFile = this.downloadSegmentFile.bind(this);
    this.openInCabana = this.openInCabana.bind(this);
    this.openInUseradmin = this.openInUseradmin.bind(this);
  }

  componentDidUpdate() {
    const { windowWidth, inView } = this.state;
    const showMapAlways = windowWidth >= 1536;
    if (showMapAlways && inView === MediaType.MAP) {
      this.setState({ inView: MediaType.VIDEO });
    }
  }

  async copySegmentName() {
    const { currentSegment } = this.props;
    if (!currentSegment || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(`${currentSegment.route}--${currentSegment.segment}`);
    this.setState({ moreInfoMenu: null });
  }

  async downloadSegmentFile(type) {
    const { currentSegment } = this.props;
    if (!currentSegment) {
      return;
    }

    const segmentKeyPath = `${currentSegment.route.replace('|', '/')}/${currentSegment.segment}`;

    let files;
    if (Demo.isDemo()) {
      files = demoFiles;
    } else {
      try {
        files = await RawApi.getRouteFiles(currentSegment.route);
      } catch (err) {
        Sentry.captureException(err, { fingerprint: 'media_download_segment_files' });
      }
    }
    const url = files[type].find((url) => url.indexOf(segmentKeyPath) !== -1);

    if (url) {
      window.location.href = url;
    }
    this.setState({ downloadMenu: null });
  }

  openInCabana() {
    const { currentSegment, loop, start } = this.props;
    if (!currentSegment) {
      return;
    }
    const offset = currentOffset();
    const params = {
      route: currentSegment.route,
      url: currentSegment.url,
      seekTime: Math.floor((offset - currentSegment.routeOffset) / 1000)
    };
    const routeStartTime = (start + currentSegment.routeOffset);

    if (loop.startTime && loop.startTime > routeStartTime && loop.duration < 180000) {
      const startTime = Math.floor((loop.startTime - routeStartTime) / 1000);
      params.segments = [startTime, Math.floor(startTime + (loop.duration / 1000))].join(',');
    }

    const win = window.open(`${window.CABANA_URL_ROOT}?${qs.stringify(params)}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  openInUseradmin() {
    const { currentSegment } = this.props;
    if (!currentSegment) {
      return;
    }

    const params = { onebox: currentSegment.route };
    const win = window.open(`${window.USERADMIN_URL_ROOT}?${qs.stringify(params)}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  render() {
    const { classes } = this.props;
    const { inView, windowWidth } = this.state;

    if (this.props.menusOnly) {  // for test
      return this.renderMenus(true);
    }

    const showMapAlways = windowWidth >= 1536;
    const mediaContainerStyle = showMapAlways ? { width: '60%' } : { width: '100%' };
    const mapContainerStyle = showMapAlways ?
      { width: '40%', marginBottom: 62, marginTop: 46, paddingLeft: 24 } :
      { width: '100%' };

    return (
      <div className={ classes.root }>
        <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
        <div style={ mediaContainerStyle }>
          { this.renderMediaOptions(showMapAlways) }
          { inView !== MediaType.MAP &&
            <DriveVideo />
          }
          { (inView === MediaType.MAP && !showMapAlways) &&
            <div style={ mapContainerStyle }>
              <DriveMap />
            </div>
          }
          <div className={ classes.timeDisplay }>
            <TimeDisplay isThin />
          </div>
        </div>
        { (inView !== MediaType.MAP && showMapAlways) &&
          <div style={ mapContainerStyle }>
            <DriveMap />
          </div>
        }
      </div>
    );
  }

  renderMediaOptions(showMapAlways) {
    const { classes } = this.props;
    const { inView } = this.state;
    return (
      <>
        <div className={classes.mediaOptionsRoot}>
          { showMapAlways ?
            <div></div>
          :
            <div className={classes.mediaOptions}>
              <div className={classes.mediaOption} style={inView !== MediaType.VIDEO ? { opacity: 0.6 } : {}}
                onClick={() => this.setState({ inView: MediaType.VIDEO })}>
                <Typography className={classes.mediaOptionText}>Video</Typography>
              </div>
              <div className={classes.mediaOption} style={inView !== MediaType.MAP ? { opacity: 0.6 } : { }}
                onClick={() => this.setState({ inView: MediaType.MAP })}>
                <Typography className={classes.mediaOptionText}>Map</Typography>
              </div>
            </div>
          }
          <div className={classes.mediaOptions}>
            <div className={classes.mediaOption} aria-haspopup="true"
              onClick={ (ev) => this.setState({ downloadMenu: ev.target }) }>
              <Typography className={classes.mediaOptionText}>Files</Typography>
            </div>
            <div className={classes.mediaOption} aria-haspopup="true"
              onClick={ (ev) => this.setState({ moreInfoMenu: ev.target }) }>
              <Typography className={classes.mediaOptionText}>More info</Typography>
            </div>
          </div>
        </div>
        { this.renderMenus() }
      </>
    );
  }

  renderMenus(alwaysOpen = false) {
    const { currentSegment } = this.props;
    const disabledStyle = {
      pointerEvents: 'auto',
    };

    const QCamAvailable = (currentSegment);
    const FCamAvailable = (currentSegment && currentSegment.hasVideo);
    const DCamAvailable = (currentSegment && currentSegment.hasDriverCamera);
    const QLogAvailable = (currentSegment);
    const RLogAvailable = (currentSegment && currentSegment.hasRLog);
    return (
      <>
        <Menu id="menu-download" open={ alwaysOpen || Boolean(this.state.downloadMenu) }
          anchorEl={ this.state.downloadMenu } onClose={ () => this.setState({ downloadMenu: null }) }
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          <MenuItem onClick={ () => this.downloadSegmentFile('qcameras') }
            disabled={ !QCamAvailable } style={ !QCamAvailable ? disabledStyle : {} }>
            Camera segment
          </MenuItem>
          <MenuItem onClick={ () => this.downloadSegmentFile('cameras') }
            title={ !FCamAvailable ? 'not available, request upload in useradmin' : null }
            disabled={ !FCamAvailable } style={ !FCamAvailable ? disabledStyle : {} }>
            Full resolution camera segment
          </MenuItem>
          <MenuItem onClick={ () => this.downloadSegmentFile('dcameras') }
            title={ !DCamAvailable ? 'not available, request upload in useradmin' : null }
            disabled={ !DCamAvailable } style={ !DCamAvailable ? disabledStyle : {} }>
            Driver camera segment
          </MenuItem>
          <Divider />
          <MenuItem onClick={ () => this.downloadSegmentFile('qlogs') }
            disabled={ !QLogAvailable } style={ !QLogAvailable ? disabledStyle : {} }>
            Log segment
          </MenuItem>
          <MenuItem onClick={ () => this.downloadSegmentFile('logs') }
            title={ !RLogAvailable ? 'not available, request upload in useradmin' : null }
            disabled={ !RLogAvailable } style={ !RLogAvailable ? disabledStyle : {} }>
            Raw log segment
          </MenuItem>
        </Menu>
        <Menu id="menu-info" open={ alwaysOpen || Boolean(this.state.moreInfoMenu) }
          anchorEl={ this.state.moreInfoMenu } onClose={ () => this.setState({ moreInfoMenu: null }) }
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          <MenuItem onClick={ this.openInCabana } id="openInCabana" >
            View in cabana
          </MenuItem>
          <MenuItem onClick={ this.openInUseradmin }>
            View in useradmin
          </MenuItem>
          <MenuItem onClick={ this.copySegmentName }>
            Copy to clipboard
          </MenuItem>
        </Menu>
      </>
    );
  }
}

const stateToProps = Obstruction({
  currentSegment: 'workerState.currentSegment',
  nextSegment: 'workerState.nextSegment',
  loop: 'workerState.loop',
  start: 'workerState.start',
});

export default connect(stateToProps)(withStyles(styles)(Media));

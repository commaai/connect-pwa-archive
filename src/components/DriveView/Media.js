import React, { Component } from 'react';
import qs from 'query-string';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { withStyles, Divider, Typography, Menu, MenuItem, CircularProgress, Button } from '@material-ui/core';

import { raw as RawApi, athena as AthenaApi } from '@commaai/comma-api';
import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';
import ResizeHandler from '../ResizeHandler';
import * as Demo from '../../demo';
import TimeDisplay from '../TimeDisplay';
import { currentOffset } from '../../timeline/playback';
import Colors from '../../colors';

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
  menuLoading: {
    position: 'absolute',
    outline: 'none',
    zIndex: 5,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  filesItem: {
    justifyContent: 'space-between',
    opacity: 1,
  },
  uploadButton: {
    marginLeft: 8,
    width: 120,
    color: Colors.white,
    borderRadius: 13,
    fontSize: '0.8rem',
    padding: '4px 12px',
    minHeight: 19,
  },
  fakeUploadButton: {
    marginLeft: 8,
    width: 96,
    color: Colors.white,
    fontSize: '0.8rem',
    padding: '4px 12px',
    textAlign: 'center',
  }
});


const FILE_TYPES = ['qcameras', 'cameras', 'dcameras', 'ecameras', 'qlogs', 'logs'];
const FILE_NAMES = {
  'qcameras': 'qcamera.ts',
  'cameras': 'fcamera.hevc',
  'dcameras': 'dcamera.hevc',
  'ecameras': 'ecamera.hevc',
  'qlogs': 'qlog.bz2',
  'logs': 'rlog.bz2',
};

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
      segmentsFiles: {},
      segmentsFilesLoading: false,
      downloadMenu: null,
      moreInfoMenu: null,
    };

    this.renderMediaOptions = this.renderMediaOptions.bind(this);
    this.renderMenus = this.renderMenus.bind(this);
    this.copySegmentName = this.copySegmentName.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.openInCabana = this.openInCabana.bind(this);
    this.openInUseradmin = this.openInUseradmin.bind(this);
    this.routesInLoop = this.routesInLoop.bind(this);
    this.fetchFiles = this.fetchFiles.bind(this);
    this.currentSegmentNum = this.currentSegmentNum.bind(this);
    this.uploadFile = this.uploadFile.bind(this);
    this.listUploadQueue = this.listUploadQueue.bind(this);
    this.athenaCall = this.athenaCall.bind(this);
    this.listDataDirectory = this.listDataDirectory.bind(this);
    this.uploadQueue = this.uploadQueue.bind(this);

    this.uploadQueueIntv = null;
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { dongleId } = this.props;
    const { windowWidth, inView, downloadMenu } = this.state;
    const showMapAlways = windowWidth >= 1536;
    if (showMapAlways && inView === MediaType.MAP) {
      this.setState({ inView: MediaType.VIDEO });
    }

    if (!prevState.downloadMenu && downloadMenu) {
      this.fetchFiles();
    }

    if (dongleId !== prevProps.dongleId) {
      this.uploadQueue(true);
    }
  }

  componentWillUnmount() {
    this.uploadQueue(false);
  }

  uploadQueue(enable) {
    if (enable) {
      if (this.uploadQueueIntv) {
        return;
      }
      this.uploadQueueIntv = setInterval(this.listUploadQueue, 5000);
    } else {
      if (this.uploadQueueIntv) {
        clearInterval(this.uploadQueueIntv);
        this.uploadQueueIntv = null;
      }
    }
  }

  async copySegmentName() {
    const { currentSegment } = this.props;
    if (!currentSegment || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(`${currentSegment.route}--${this.currentSegmentNum()}`);
    this.setState({ moreInfoMenu: null });
  }

  currentSegmentNum() {
    const offset = currentOffset();
    return Math.floor((offset - this.props.currentSegment.routeOffset) / 60000);
  }

  async downloadFile(url) {
    if (url) {
      window.location.href = url;
    }
    this.setState({ downloadMenu: null });
  }

  openInCabana() {
    const { currentSegment, loop, filter } = this.props;
    if (!currentSegment) {
      return;
    }
    const offset = currentOffset();
    const params = {
      route: currentSegment.route,
      url: currentSegment.url,
      seekTime: Math.floor((offset - currentSegment.routeOffset) / 1000)
    };
    const routeStartTime = (filter.start + currentSegment.routeOffset);

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

  routesInLoop() {
    const { segments, loop } = this.props;
    return segments
      .filter((route) =>
        route.startTime < loop.startTime + loop.duration && route.startTime + route.duration > loop.startTime)
      .map((route) => route.route);
  }

  async fetchFiles() {
    this.setState({ segmentsFilesLoading: true });
    let promises = [];
    if (Demo.isDemo()) {
      promises.push((async () => ['3533c53bb29502d1|2019-12-10--01-13-27', demoFiles])());
    } else {
      for (const routeName of this.routesInLoop()) {
        promises.push((async () => [routeName, await RawApi.getRouteFiles(routeName)])());
      }
    }

    let files;
    try {
      files = await Promise.all(promises);
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'media_fetch_files' });
      this.setState({ segmentsFiles: null, segmentsFilesLoading: false });
    }

    const res = {};
    for (const [routeName, routeFiles] of files) {
      for (const type of FILE_TYPES) {
        for (const file of routeFiles[type]) {
          const urlName = routeName.replace('|', '/');
          const segmentNum = parseInt(file.split(urlName)[1].split('/')[1]);
          const segName = `${routeName}--${segmentNum}`;
          if (!res[segName]) {
            res[segName] = {};
          }
          res[segName][type] = {
            url: file,
          };
        }
      }
    }

    this.setState({
      segmentsFilesLoading: false,
      segmentsFiles: res,
    });
  }

  async listDataDirectory(routeName) {
    const payload = {
      method: 'listDataDirectory',
      params: { prefix: routeName },
      jsonrpc: '2.0',
      id: 0,
    };
    const dataDirectory = await this.athenaCall(payload, 'media_athena_datadirectory');
    if (dataDirectory) {
      this.setState({ dataDirectory });
    }
  }

  async listUploadQueue() {

    const payload = {
      method: 'listUploadQueue',
      jsonrpc: '2.0',
      id: 0,
    };
    const uploadQueue = await this.athenaCall(payload, 'media_athena_uploadqueue');
    if (!uploadQueue || !uploadQueue.result || !uploadQueue.result.length) {
      this.uploadQueue(false);
    } else {
      let { segmentsFiles } = this.state;
      for (const uploading of uploadQueue.result) {
        const urlParts = uploading.url.split('?')[0].split('/');
        const filename = urlParts[urlParts.length - 1];
        const segNum = urlParts[urlParts.length - 2];
        const datetime = urlParts[urlParts.length - 3];
        const dongleId = urlParts[urlParts.length - 4];
        const seg = `${dongleId}|${datetime}--${segNum}`;
        const type = Object.entries(FILE_NAMES).find((e) => e[1] == filename)[0];
        if (!segmentsFiles[seg]) {
          segmentsFiles[seg] = {};
        }
        segmentsFiles[seg][type] = {
          current: uploading.current,
          progress: uploading.progress,
        };
      }
      this.setState({ segmentsFiles });
    }
  }

  async athenaCall(payload, sentry_fingerprint) {
    const { dongleId } = this.props;
    try {
      const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
      if (dongleId === this.props.dongleId) {
        return resp;
      }
    } catch(err) {
      if (dongleId === this.props.dongleId) {
        if (!err.message || err.message.indexOf('Device not registered') === -1) {
          console.log(err);
          Sentry.captureException(err, { fingerprint: sentry_fingerprint });
        }
        return { error: err.message };
      }
    }
  }

  async uploadFile(type) {
    const { dongleId, currentSegment } = this.props;
    const routeNoDongleId = currentSegment.route.split('|')[1];
    const path = `${routeNoDongleId}--${this.currentSegmentNum()}/${FILE_NAMES[type]}`;
    let url;
    try {
      const resp = await RawApi.getUploadUrl(dongleId, path, 7);
      if (!resp.url) {
        console.log(resp);
        return;
      }
      url = resp.url;
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'media_uploadurl' });
    }

    const payload = {
      id: 0,
      jsonrpc: "2.0",
      method: "uploadFileToUrl",
      params: [path, url, { "x-ms-blob-type": "BlockBlob" }],
    };
    await this.athenaCall(payload, 'media_athena_uploadfile');
    this.uploadQueueIntv = setInterval(this.listUploadQueue, 1000);
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
    const { currentSegment, segmentsFilesLoading, classes } = this.props;
    const { segmentsFiles } = this.state;
    const disabledStyle = {
      pointerEvents: 'auto',
    };

    let qcam = {}, fcam = {}, ecam = {}, dcam = {}, qlog = {}, rlog = {};
    if (segmentsFiles && currentSegment) {
      const seg = `${currentSegment.route}--${this.currentSegmentNum()}`;
      if (segmentsFiles[seg]) {
        qcam = segmentsFiles[seg]['qcameras'] || {};
        fcam = segmentsFiles[seg]['cameras'] || {};
        ecam = segmentsFiles[seg]['ecameras'] || {};
        dcam = segmentsFiles[seg]['dcameras'] || {};
        qlog = segmentsFiles[seg]['qlogs'] || {};
        rlog = segmentsFiles[seg]['logs'] || {};
      }
    }

    const buttons = [
      [qcam, 'Camera segment', 'qcameras'],
      [fcam, 'Full resolution camera segment', 'cameras'],
      [ecam, 'Wide road camera segment', 'ecameras'],
      [dcam, 'Driver camera segment', 'dcameras'],
      [qlog, 'Log segment', 'qlogs'],
      [rlog, 'Raw log segment', 'logs'],
    ];

    return (
      <>
        <Menu id="menu-download" open={ alwaysOpen || Boolean(this.state.downloadMenu) }
          anchorEl={ this.state.downloadMenu } onClose={ () => this.setState({ downloadMenu: null }) }
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          { segmentsFilesLoading &&
            <div className={ classes.menuLoading }>
              <CircularProgress size={ 36 } style={{ color: Colors.white }} />
            </div>
          }
          { buttons.flatMap(([file, name, type]) => [
            type === 'qlogs' ? <Divider key={ 'divider' } /> : null,
            <MenuItem key={ type } onClick={ () => this.downloadFile(file.url) } className={ classes.filesItem }
              disabled={ !file.url } style={ !file.url ? disabledStyle : {} }>
              <span style={ !file.url ? { color: Colors.white60 } : {} }>{ name }</span>
              { Boolean(!segmentsFilesLoading && !file.url && !file.progress) &&
                <Button className={ classes.uploadButton } onClick={ () => this.uploadFile(type) }>
                  request upload
                </Button>
              }
              { Boolean(!segmentsFilesLoading && !file.url && file.progress) &&
                <div className={ classes.fakeUploadButton }>
                  { file.current ? `${parseInt(file.progress * 100)}%` : 'upload pending' }
                </div>
              }
            </MenuItem>
          ]) }
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
  dongleId: 'dongleId',
  currentSegment: 'currentSegment',
  segments: 'segments',
  loop: 'loop',
  filter: 'filter',
});

export default connect(stateToProps)(withStyles(styles)(Media));

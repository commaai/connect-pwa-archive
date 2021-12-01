import React, { Component } from 'react';
import qs from 'query-string';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { withStyles, Divider, Typography, Menu, MenuItem, CircularProgress, Button, Modal,
  Paper } from '@material-ui/core';
import { raw as RawApi, athena as AthenaApi } from '@commaai/comma-api';

import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';
import ResizeHandler from '../ResizeHandler';
import * as Demo from '../../demo';
import TimeDisplay from '../TimeDisplay';
import UploadQueue from '../Files/UploadQueue';
import { currentOffset } from '../../timeline/playback';
import Colors from '../../colors';
import { deviceIsOnline } from '../../utils';
import { fetchFiles, fetchUploadQueue, updateFiles } from '../../actions/files';

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
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const FILE_NAMES = {
  'qcameras': 'qcamera.ts',
  'cameras': 'fcamera.hevc',
  'dcameras': 'dcamera.hevc',
  'ecameras': 'ecamera.hevc',
  'qlogs': 'qlog.bz2',
  'logs': 'rlog.bz2',
};
const MAX_OPEN_REQUESTS = 15;
const MAX_RETRIES = 5;

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
      uploadModal: false,
    };

    this.renderMediaOptions = this.renderMediaOptions.bind(this);
    this.renderMenus = this.renderMenus.bind(this);
    this.copySegmentName = this.copySegmentName.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.openInCabana = this.openInCabana.bind(this);
    this.openInUseradmin = this.openInUseradmin.bind(this);
    this.routesInLoop = this.routesInLoop.bind(this);
    this.currentSegmentNum = this.currentSegmentNum.bind(this);
    this.uploadFile = this.uploadFile.bind(this);
    this.uploadFilesAll = this.uploadFilesAll.bind(this);
    this.doUpload = this.doUpload.bind(this);
    this.athenaCall = this.athenaCall.bind(this);

    this.openRequests = 0;
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(_, prevState) {
    const { windowWidth, inView, downloadMenu } = this.state;
    const showMapAlways = windowWidth >= 1536;
    if (showMapAlways && inView === MediaType.MAP) {
      this.setState({ inView: MediaType.VIDEO });
    }

    if (!prevState.downloadMenu && downloadMenu) {
      if (Demo.isDemo()) {
        this.props.dispatch(fetchFiles('3533c53bb29502d1|2019-12-10--01-13-27'));
      } else {
        for (const routeName of this.routesInLoop()) {
          this.props.dispatch(fetchFiles(routeName));
        }
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

  async athenaCall(payload, sentry_fingerprint, retryCount = 0) {
    const { dongleId } = this.props;
    try {
      while (this.openRequests > MAX_OPEN_REQUESTS) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      this.openRequests += 1;
      const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
      this.openRequests -= 1;
      if (dongleId === this.props.dongleId) {
        return resp;
      }
    } catch(err) {
      this.openRequests -= 1;
      if (!err.resp && retryCount < MAX_RETRIES) {
        setTimeout(() => this.athenaCall(payload, sentry_fingerprint, retryCount + 1), 2000);
      }
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
    const seg = `${dongleId}|${routeNoDongleId}--${this.currentSegmentNum()}`;

    const uploading = {};
    uploading[seg] = {};
    uploading[seg][type] = { requested: true };
    this.props.dispatch(updateFiles(uploading));

    this.doUpload(dongleId, seg, type, path);
  }

  async uploadFilesAll(types) {
    const { dongleId, device, segmentData, loop, files } = this.props;
    if (types === undefined) {
      types = ['logs', 'cameras', 'dcameras'];
      if (device.device_type === 'three') {
        types.push('ecameras');
      };
    }

    if (!segmentData.segments || !files) {
      return;
    }

    const uploading = {}
    for (const segment of segmentData.segments) {
      if (segment.start_time_utc_millis < loop.startTime + loop.duration &&
        segment.start_time_utc_millis + segment.duration > loop.startTime)
      {
        for (const type of types) {
          if (!files[segment.canonical_name] || !files[segment.canonical_name][type]) {
            if (!uploading[segment.canonical_name]) {
              uploading[segment.canonical_name] = {};
            }
            uploading[segment.canonical_name][type] = { requested: true };
          }
        }
      }
    }
    this.props.dispatch(updateFiles(uploading));

    for (const seg in uploading) {
      for (const type in uploading[seg]) {
        const path = `${seg.split('|')[1]}/${FILE_NAMES[type]}`;
        this.doUpload(dongleId, seg, type, path);
      }
    }
  }

  async doUpload(dongleId, seg, type, path, retryCount = 0) {
    let url;
    try {
      while (this.openRequests > MAX_OPEN_REQUESTS) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      this.openRequests += 1;
      const resp = await RawApi.getUploadUrl(dongleId, path, 7);
      this.openRequests -= 1;
      if (!resp.url) {
        console.log(resp);
        return;
      }
      url = resp.url;
    } catch (err) {
      this.openRequests -= 1;
      if (!err.resp && retryCount < MAX_RETRIES) {
        setTimeout(() => this.doUpload(dongleId, seg, type, path, retryCount + 1), 2000);
      } else {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'media_upload_geturl' });
      }
      return;
    }

    const payload = {
      id: 0,
      jsonrpc: "2.0",
      method: "uploadFileToUrl",
      params: [path, url, { "x-ms-blob-type": "BlockBlob" }],
    };
    const resp = await this.athenaCall(payload, 'media_athena_upload');
    if (resp.error) {
      uploading[seg][type] = {};
      this.props.dispatch(updateFiles(uploading));
    } else {
      this.props.dispatch(fetchUploadQueue());
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
    const { currentSegment, device, classes, files } = this.props;
    const { downloadMenu, moreInfoMenu, uploadModal } = this.state;

    if (!device) {
      return;
    }

    const disabledStyle = { pointerEvents: 'auto' };
    const online = deviceIsOnline(device);

    let qcam = {}, fcam = {}, ecam = {}, dcam = {}, qlog = {}, rlog = {};
    if (files && currentSegment) {
      const seg = `${currentSegment.route}--${this.currentSegmentNum()}`;
      if (files[seg]) {
        qcam = files[seg]['qcameras'] || {};
        fcam = files[seg]['cameras'] || {};
        ecam = files[seg]['ecameras'] || {};
        dcam = files[seg]['dcameras'] || {};
        qlog = files[seg]['qlogs'] || {};
        rlog = files[seg]['logs'] || {};
      }
    }

    const buttons = [
      [qcam, 'Camera segment', 'qcameras'],
      [fcam, 'Full resolution camera segment', 'cameras'],
      device && device.device_type === 'three' ? [ecam, 'Wide road camera segment', 'ecameras'] : null,
      [dcam, 'Driver camera segment', 'dcameras'],
      [qlog, 'Log segment', 'qlogs'],
      [rlog, 'Raw log segment', 'logs'],
    ];

    return ( <>
      <Menu id="menu-download" open={ Boolean(alwaysOpen || downloadMenu) }
        anchorEl={ downloadMenu } onClose={ () => this.setState({ downloadMenu: null }) }
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        { !files &&
          <div className={ classes.menuLoading }>
            <CircularProgress size={ 36 } style={{ color: Colors.white }} />
          </div>
        }
        { buttons.filter((b) => Boolean(b)).flatMap(([file, name, type]) => [
          type === 'qlogs' ? <Divider key={ 'divider' } /> : null,
          <MenuItem key={ type } onClick={ file.url ? () => this.downloadFile(file.url) : null }
            className={ classes.filesItem } disabled={ !file.url } style={ !file.url ? disabledStyle : {} }
            title={ Boolean(!file.url && !online) ? 'connect device to enable uploading' : null }>
            <span style={ !file.url ? { color: Colors.white60 } : {} }>{ name }</span>
            { Boolean(files && !file.url && online && file.progress === undefined && !file.requested) &&
              <Button className={ classes.uploadButton } onClick={ () => this.uploadFile(type) }>
                request upload
              </Button>
            }
            { Boolean(files && !file.url && online && file.progress !== undefined) &&
              <div className={ classes.fakeUploadButton }>
                { file.current ? `${parseInt(file.progress * 100)}%` : 'pending' }
              </div>
            }
            { Boolean(files && !file.url && online && file.requested) &&
              <div className={ classes.fakeUploadButton }>
                <CircularProgress style={{ color: Colors.white }} size={ 17 } />
              </div>
            }
          </MenuItem>
        ]) }
        <Divider />
        <MenuItem onClick={ files ? () => this.uploadFilesAll(['logs']) : null }
          className={ classes.filesItem } disabled={ !files }
          style={ !files ? { ...disabledStyle, color: Colors.white60 } : {} }>
          Request upload all raw logs
        </MenuItem>
        <MenuItem onClick={ files ? () => this.uploadFilesAll() : null }
          className={ classes.filesItem } disabled={ !files }
          style={ !files ? { ...disabledStyle, color: Colors.white60 } : {} }>
          Request upload all files
        </MenuItem>
        <MenuItem onClick={ files ? () => this.setState({ uploadModal: true, downloadMenu: null }) : null }
          className={ classes.filesItem } disabled={ !files }
          style={ !files ? { ...disabledStyle, color: Colors.white60 } : {} }>
          View upload queue
        </MenuItem>
      </Menu>
      <Menu id="menu-info" open={ Boolean(alwaysOpen || moreInfoMenu) }
        anchorEl={ moreInfoMenu } onClose={ () => this.setState({ moreInfoMenu: null }) }
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
      <UploadQueue open={ uploadModal } onClose={ () => this.setState({ uploadModal: false }) }
        update={ Boolean(uploadModal || downloadMenu) } />
    </> );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
  currentSegment: 'currentSegment',
  segments: 'segments',
  segmentData: 'segmentData',
  loop: 'loop',
  filter: 'filter',
  files: 'files',
});

export default connect(stateToProps)(withStyles(styles)(Media));

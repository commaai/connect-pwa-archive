import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';

import {
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Modal,
  Paper,
  TextField,
  Typography,
  withStyles,
} from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import SaveIcon from '@material-ui/icons/Save';
import ShareIcon from '@material-ui/icons/Share';
import WarningIcon from '@material-ui/icons/Warning';

import { devices as Devices } from '@commaai/api';
import { primeNav, selectDevice, updateDevice } from '../../actions';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import UploadQueue from '../Files/UploadQueue';

const styles = (theme) => ({
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
    maxWidth: '90%',
    left: '50%',
    top: '40%',
    transform: 'translate(-50%, -50%)',
    outline: 'none',
  },
  modalUnpair: {
    width: theme.spacing.unit * 45,
    maxWidth: '80%',
  },
  titleContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  buttonGroup: {
    textAlign: 'right',
  },
  form: {
    paddingTop: theme.spacing.unit,
    paddingBottom: theme.spacing.unit,
  },
  formRow: {
    minHeight: 75,
  },
  formRowError: {
    padding: 10,
    marginBottom: 5,
    backgroundColor: Colors.red500,
  },
  textField: {
    maxWidth: '70%',
  },
  fabProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  wrapper: {
    margin: theme.spacing.unit,
    position: 'relative',
    display: 'inline-block',
  },
  primeManageButton: {
    marginTop: 20,
    marginRight: 20,
    '&:last-child': { marginRight: 0 },
  },
  topButtonGroup: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap-reverse',
    alignItems: 'baseline',
  },
  cancelButton: {
    backgroundColor: Colors.grey200,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey400,
    },
  },
  unpairError: {
    marginTop: 15,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.3)',
    '& p': { display: 'inline-block', marginLeft: 10 },
    color: Colors.white,
  },
  unpairWarning: {
    marginTop: 15,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: Colors.orange200,
    '& p': { display: 'inline-block', marginLeft: 10 },
    color: Colors.white,
  },
});

const initialState = {
  deviceAlias: '',
  loadingDeviceAlias: false,
  loadingDeviceShare: false,
  hasSavedAlias: false,
  shareEmail: '',
  unpairConfirm: false,
  unpaired: false,
  loadingUnpair: false,
  error: null,
  unpairError: null,
  uploadModal: false,
};

class DeviceSettingsModal extends Component {
  constructor(props) {
    super(props);

    this.state = {
      ...initialState,
    };

    this.onPrimeSettings = this.onPrimeSettings.bind(this);
    this.handleAliasChange = this.handleAliasChange.bind(this);
    this.handleEmailChange = this.handleEmailChange.bind(this);
    this.callOnEnter = this.callOnEnter.bind(this);
    this.setDeviceAlias = this.setDeviceAlias.bind(this);
    this.shareDevice = this.shareDevice.bind(this);
    this.unpairDevice = this.unpairDevice.bind(this);
    this.closeUnpair = this.closeUnpair.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.dongleId !== this.props.dongleId) {
      const alias = this.props.device?.dongle_id === this.props.dongleId ? this.props.device.alias : '';
      this.setState({
        ...initialState,
        deviceAlias: alias,
      });
    }
  }

  handleAliasChange(e) {
    this.setState((state, props) => ({
      deviceAlias: e.target.value,
      hasSavedAlias: e.target.value === props.device.dongle_id ? state.hasSavedAlias : false,
    }));
  }

  handleEmailChange(e) {
    this.setState({
      shareEmail: e.target.value,
      hasShared: false,
      error: null,
    });
  }

  static callOnEnter(method, e) {
    if (e.key === 'Enter') {
      method();
    }
  }

  async setDeviceAlias() {
    const { dongle_id: dongleId } = this.props.device;

    if (this.state.loadingDeviceAlias) {
      return;
    }

    this.setState({
      loadingDeviceAlias: true,
      hasSavedAlias: false,
    });
    try {
      const device = await Devices.setDeviceAlias(dongleId, this.state.deviceAlias.trim());
      this.props.dispatch(updateDevice(device));
      this.setState({
        loadingDeviceAlias: false,
        hasSavedAlias: true,
      });
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'device_settings_alias' });
      this.setState({ error: err.message, loadingDeviceAlias: false });
    }
  }

  async shareDevice() {
    if (this.state.loadingDeviceShare) {
      return;
    }

    this.setState({
      loadingDeviceShare: true,
      hasShared: false,
    });
    try {
      await Devices.grantDeviceReadPermission(this.props.dongleId, this.state.shareEmail.trim());
      this.setState({
        loadingDeviceShare: false,
        shareEmail: '',
        hasShared: true,
        error: null,
      });
    } catch (err) {
      if (err.resp && err.resp.status === 404) {
        this.setState({ error: 'could not find user', loadingDeviceShare: false });
      } else {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'device_settings_share' });
        this.setState({ error: 'unable to share', loadingDeviceShare: false });
      }
    }
  }

  onPrimeSettings() {
    let intv = null;
    const doPrimeNav = () => {
      if (intv) {
        clearInterval(intv);
      }
      this.props.dispatch(primeNav(true));
      this.props.onClose();
    };

    if (this.props.dongleId !== this.props.globalDongleId) {
      this.props.dispatch(selectDevice(this.props.dongleId));
      intv = setInterval(() => {
        if (this.props.dongleId === this.props.globalDongleId) {
          doPrimeNav();
        }
      }, 100);
    } else {
      doPrimeNav();
    }
  }

  async unpairDevice() {
    this.setState({ loadingUnpair: true });
    try {
      const resp = await Devices.unpair(this.props.device.dongle_id);
      if (resp.success) {
        this.setState({ loadingUnpair: false, unpaired: true });
      } else if (resp.error) {
        this.setState({ loadingUnpair: false, unpaired: false, unpairError: resp.error });
      } else {
        this.setState({ loadingUnpair: false, unpaired: false, unpairError: 'Could not successfully unpair' });
      }
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'device_settings_unpair' });
      console.error(err);
      this.setState({ loadingUnpair: false, unpaired: false, unpairError: 'Unable to unpair' });
    }
  }

  closeUnpair() {
    if (this.state.unpaired) {
      window.location = window.location.origin;
    } else {
      this.setState({ unpairConfirm: false });
    }
  }

  render() {
    const { classes, device } = this.props;
    if (!device) {
      return null;
    }

    return (
      <>
        <Modal
          aria-labelledby="device-settings-modal"
          aria-describedby="device-settings-modal-description"
          open={this.props.isOpen}
          onClose={this.props.onClose}
        >
          <Paper className={classes.modal}>
            <div className={ classes.titleContainer }>
              <Typography variant="title">
                Device settings
              </Typography>
              <Typography variant="caption">
                { device.dongle_id }
              </Typography>
            </div>
            <Divider />
            <div>
              <Button variant="outlined" className={ classes.primeManageButton } onClick={ this.onPrimeSettings }>
                Prime settings
              </Button>
              <Button
                variant="outlined"
                className={ classes.primeManageButton }
                onClick={ () => this.setState({ unpairConfirm: true }) }
              >
                Unpair
              </Button>
            </div>
            <div>
              <Button
                variant="outlined"
                className={ classes.primeManageButton }
                onClick={ () => this.setState({ uploadModal: true }) }
              >
                Uploads
              </Button>
            </div>
            <div className={classes.form}>
              { this.state.error && (
              <div className={ classes.formRowError }>
                <Typography>{ this.state.error }</Typography>
              </div>
              ) }
              <div className={classes.formRow}>
                <TextField
                  id="device_alias"
                  label="Device name"
                  className={ classes.textField }
                  value={ this.state.deviceAlias ? this.state.deviceAlias : '' }
                  onChange={this.handleAliasChange}
                  onKeyPress={ (ev) => this.callOnEnter(this.setDeviceAlias, ev) }
                />
                { (this.props.device.alias !== this.state.deviceAlias || this.state.hasSavedAlias)
                && (
                <div className={classes.wrapper}>
                  <IconButton variant="fab" onClick={this.setDeviceAlias}>
                    { this.state.hasSavedAlias ? <CheckIcon /> : <SaveIcon /> }
                  </IconButton>
                  {this.state.loadingDeviceAlias && <CircularProgress size={48} className={classes.fabProgress} />}
                </div>
                )}
              </div>
              <div className={classes.formRow}>
                <TextField
                  id="device_share"
                  label="Share by email or user id"
                  className={ classes.textField }
                  value={this.state.shareEmail}
                  onChange={this.handleEmailChange}
                  variant="outlined"
                  onKeyPress={ (ev) => this.callOnEnter(this.shareDevice, ev) }
                  helperText="give another user read access to this device"
                />
                { (this.state.shareEmail.length > 0 || this.state.hasShared)
                && (
                <div className={classes.wrapper}>
                  <IconButton variant="fab" onClick={this.shareDevice}>
                    { this.state.hasShared ? <CheckIcon /> : <ShareIcon /> }
                  </IconButton>
                  {this.state.loadingDeviceShare && <CircularProgress size={48} className={classes.fabProgress} />}
                </div>
                )}
              </div>
            </div>
            <div className={classes.buttonGroup}>
              <Button variant="contained" className={ classes.cancelButton } onClick={this.props.onClose}>
                Close
              </Button>
            </div>
          </Paper>
        </Modal>
        <Modal
          aria-labelledby="device-settings-modal"
          aria-describedby="device-settings-modal-description"
          open={this.state.unpairConfirm}
          onClose={ this.closeUnpair }
        >
          <Paper className={ `${classes.modal} ${classes.modalUnpair}` }>
            <div className={ classes.titleContainer }>
              <Typography variant="title">
                Unpair device
              </Typography>
              <Typography variant="caption">
                { device.dongle_id }
              </Typography>
            </div>
            <Divider />
            { this.state.unpairError
            && (
            <div className={ classes.unpairError }>
              <ErrorOutline />
              <Typography>{ this.state.unpairError }</Typography>
            </div>
            )}
            { this.props.device.prime
            && (
            <div className={ classes.unpairWarning }>
              <WarningIcon />
              <Typography>Unpairing will also cancel the comma prime subscription for this device.</Typography>
            </div>
            )}
            <div className={ classes.topButtonGroup }>
              <Button
                variant="contained"
                className={ `${classes.primeManageButton} ${classes.cancelButton}` }
                onClick={ this.closeUnpair }
              >
                { this.state.unpaired ? 'Close' : 'Cancel' }
              </Button>
              { this.state.unpaired
                ? <Typography variant="body2">Unpaired</Typography>
                : (
                  <Button
                    variant="outlined"
                    className={ classes.primeManageButton }
                    onClick={ this.unpairDevice }
                    disabled={ this.state.loadingUnpair }
                  >
                    { this.state.loadingUnpair ? 'Unpairing...' : 'Confirm' }
                  </Button>
                )}
            </div>
          </Paper>
        </Modal>
        <UploadQueue
          open={ this.state.uploadModal }
          update={ this.state.uploadModal }
          onClose={ () => this.setState({ uploadModal: false }) }
          device={ device }
        />
      </>
    );
  }
}

const stateToProps = (state, ownProps) => {
  const device = state.devices.find((d) => d.dongle_id === ownProps.dongleId)
    || ((state.device && state.device.dongle_id === ownProps.dongleId) ? state.device : null);
  return {
    subscription: state.subscription,
    device,
    globalDongleId: state.dongleId,
  };
};

export default connect(stateToProps)(withStyles(styles)(DeviceSettingsModal));

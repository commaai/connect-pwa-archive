import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { Link } from 'react-router-dom';

import { withStyles } from '@material-ui/core/styles';
import 'mapbox-gl/src/css/mapbox-gl.css';
import Typography from '@material-ui/core/Typography';
import Drawer from '@material-ui/core/Drawer';

import DeviceList from '../Dashboard/DeviceList';

import { selectDevice } from '../../actions';

const styles = () => ({
  logo: {
    alignItems: 'center',
    display: 'flex',
    textDecoration: 'none',
    minHeight: 64,
  },
  logoImg: {
    height: 34,
    width: 18.9,
    margin: '0px 28px',
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
  },
  drawerContent: {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(180deg, #1B2023 0%, #111516 100%)',
  },
});

class AppDrawer extends Component {
  constructor(props) {
    super(props);

    this.ref = React.createRef();

    this.onRef = this.onRef.bind(this);
    this.handleDeviceSelected = this.handleDeviceSelected.bind(this);
    this.toggleDrawerOff = this.toggleDrawerOff.bind(this);
  }

  handleDeviceSelected(dongleId) {
    this.props.dispatch(selectDevice(dongleId));
    this.toggleDrawerOff();
  }

  onRef(el) {
    this.ref.current = el;
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  }

  toggleDrawerOff() {
    this.props.handleDrawerStateChanged(false);
  }

  render() {
    const { classes, isPermanent, drawerIsOpen, selectedDongleId } = this.props;

    return (
      <Drawer
        open={ isPermanent || drawerIsOpen }
        onClose={this.toggleDrawerOff}
        variant={ isPermanent ? 'permanent' : 'temporary' }
        PaperProps={{ style: { width: this.props.width, top: 'auto' } }}
      >
        <div ref={this.onRef} className={classes.drawerContent}>
          { !isPermanent
            && (
              <Link to="/" className={ classes.logo }>
                <img alt="comma" src="/images/comma-white.png" className={classes.logoImg} />
                <Typography className={ classes.logoText }>connect</Typography>
              </Link>
            )}
          <DeviceList
            selectedDevice={ selectedDongleId }
            handleDeviceSelected={this.handleDeviceSelected}
          />
        </div>
      </Drawer>
    );
  }
}

const stateToProps = Obstruction({
  selectedDongleId: 'dongleId',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(AppDrawer));

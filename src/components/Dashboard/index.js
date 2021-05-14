import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';

import DriveList from './DriveList';
import Prime from '../Prime';
import PrimeBanner from '../Prime/PrimeBanner'

const styles = (/* theme */) => ({
  base: {
    background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
});

class Dashboard extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { classes, primeNav, device } = this.props;

    return (
      <div className={classes.base}>
        { primeNav ?
          ( <Prime /> )
        : ( <>
          { device && !device.prime && device.is_owner && <PrimeBanner collapsed /> }
          <DriveList />
        </> ) }
      </div>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  selectedDongleId: 'workerState.dongleId',
  primeNav: 'workerState.primeNav',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));

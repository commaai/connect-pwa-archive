import React, { useState } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';

import DashboardNavigation from './DashboardNavigation';
import DriveList from './DriveList';
import Navigation from '../Navigation';
import DeviceInfo from '../DeviceInfo';
import Prime from '../Prime';

import { useWindowWidth } from '../../hooks/window';

const styles = () => ({
  base: {
    display: 'flex',
    flexDirection: 'column',
  },
  mobile: {
    paddingBottom: 56,
  },
});

const Dashboard = ({ classes, device, dongleId, primeNav }) => {
  const [page, setPage] = useState(0);
  const windowWidth = useWindowWidth();

  if (!device || !dongleId) {
    return null;
  }
  if (primeNav) {
    return <Prime />;
  }

  if (windowWidth < 768) {
    return (
      <div className={`${classes.base} ${page === 1 && classes.mobile}`}>
        {page === 0 && (
          <>
            <Navigation
              hasNav={device.prime && device.device_type === 'three'}
              forceFocus
            />
            <DeviceInfo />
          </>
        )}
        {page === 1 && <DriveList />}
        <DashboardNavigation page={page} setPage={setPage} />
      </div>
    );
  }

  return (
    <div className={classes.base}>
      <Navigation hasNav={device.prime && device.device_type === 'three'} />
      <DeviceInfo />
      <DriveList />
    </div>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  primeNav: 'primeNav',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));

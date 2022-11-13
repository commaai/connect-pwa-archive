import { Button, CircularProgress, Snackbar, withStyles } from '@material-ui/core';
import React, { useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';

import { register, unregister } from '../../serviceWorkerRegistration';

const styles = () => ({
  button: {
    textTransform: 'uppercase',
  },
});

const ServiceWorkerWrapper = (props) => {
  const { classes } = props;

  const [showUpdate, setShowUpdate] = useState(false);
  const [loading, setLoading] = useState(false);

  const [waitingWorker, setWaitingWorker] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const onSWUpdate = (registration) => {
    if (!registration.waiting) {
      Sentry.captureMessage('[ServiceWorkerWrapper] Update is available but there is no waiting service worker to install', 'warning');
      return;
    }
    console.debug('[ServiceWorkerWrapper] Update is available');
    setWaitingWorker(registration.waiting);
    setShowUpdate(true);
  };

  const onSWChange = () => {
    console.debug('[ServiceWorkerWrapper] Controller changed');
    if (refreshing) return;
    setRefreshing(true);
    window.location.reload();
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && process.env.REACT_APP_SERVICEWORKER) {
      navigator.serviceWorker.addEventListener('controllerchange', onSWChange);

      console.debug('[ServiceWorkerWrapper] Registering service worker...');
      register({
        // show update found message
        onUpdate: onSWUpdate,

        // TODO: show "connect now works offline" message
        onSuccess: null,
      });
    } else {
      unregister();
    }
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const onReload = () => {
    if (!waitingWorker) {
      Sentry.captureMessage('[ServiceWorkerWrapper] No waiting worker found', 'error');
      setShowUpdate(false);
      return;
    }
    setLoading(true);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => {
      Sentry.captureMessage('[ServiceWorkerWrapper] Timed out waiting for controller change', 'error');
      window.location.reload();
    }, 60_000);
  };

  const onDismiss = () => {
    setShowUpdate(false);
  };

  const action = (
    <>
      <Button
        classes={{ root: classes.button }}
        color="primary"
        size="small"
        disabled={loading}
        onClick={onReload}
      >
        {loading ? <CircularProgress color="primary" size={20} /> : 'Reload'}
      </Button>
      <Button
        classes={{ root: classes.button }}
        color="primary"
        size="small"
        disabled={loading}
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </>
  );

  return (
    <Snackbar
      open={showUpdate}
      message="An update is ready. Reload to get the latest version."
      action={action}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    />
  );
};

export default withStyles(styles)(ServiceWorkerWrapper);

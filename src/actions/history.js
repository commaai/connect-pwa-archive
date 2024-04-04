import { LOCATION_CHANGE } from 'connected-react-router';
import { getDongleID, getZoom, getSegmentRange, getPrimeNav } from '../url';
import { primeNav, selectDevice, pushTimelineRange } from './index';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const pathDongleId = getDongleID(action.payload.location.pathname);
    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(selectDevice(pathDongleId, false));
    }

    // TODO: this should redirect to a log id
    const pathZoom = getZoom(action.payload.location.pathname);
    if (pathZoom !== state.zoom) {
      dispatch(pushTimelineRange(pathZoom?.start, pathZoom?.end, false));
    }

    const pathSegmentRange = getSegmentRange(action.payload.location.pathname);
    if (true) {
    //if (pathSegmentRange != state.segmentRange) {
      //dispatch(pushSegmentRange(pathSegmentRange?.log_id, pathSegmentRange?.start, pathSegmentRange?.end));
      console.log("segment range", pathSegmentRange);
    }

    const pathPrimeNav = getPrimeNav(action.payload.location.pathname);
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav));
    }
  } else {
    next(action);
  }
};

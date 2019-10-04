import initialState from './initialState';
import Playback from './playback';

const ACTION_UPDATE_SEGMENTS = 'update_segments';
const ACTION_LOAD_SEGMENT_METADATA = 'load_segment_metadata';
const ACTION_SEGMENT_METADATA = 'segment_metadata';
const ACTION_RESOLVE_ANNOTATION = 'resolve_annotation';

const SEGMENT_LENGTH = 1000 * 60;

const API = {
  // helpers
  getCurrentSegment,
  getNextSegment,
  hasSegmentMetadata,
  parseSegmentMetadata,
  hasCameraAtOffset,

  // actions
  updateSegments,
  fetchSegmentMetadata,
  insertSegmentMetadata,
  resolveAnnotation,

  // constants
  SEGMENT_LENGTH,

  // reducer
  reducer
};
export default API;

/*
segments look like, but can contain additional data if they want
for example, caching url metadata
{
  route: 'dongleid|date',
  segment: 5
}
*/

function reducer(state = initialState, action) {
  switch (action.type) {
    case ACTION_LOAD_SEGMENT_METADATA:
      state.segmentData = {
        promise: action.promise,
        start: action.start,
        end: action.end,
        dongleId: state.dongleId
      };
      break;
    case ACTION_SEGMENT_METADATA:
      state.segmentData = action.data;
      state.segments = action.segments;
      break;
    case ACTION_RESOLVE_ANNOTATION:
      let found = false;
      state.segments = state.segments.map((segment) => {
        if (found || segment.route !== action.route) {
          return segment;
        }

        segment.events = segment.events.map((event) => {
          if (found || event.time !== action.event.time || event.type !== action.event.type) {
            return event;
          }
          event.id = action.annotation.id;
          event.annotation = action.annotation;
          found = true;
          return event;
        });

        return segment;
      });
      if (!found) {
        console.log('Resolving unknonwn annotation');
        debugger;
      }
      break;
  }
  const currentSegment = getCurrentSegment(state);
  const nextSegment = getNextSegment(state);

  if (currentSegment) {
    state.route = currentSegment.route;
    state.segment = currentSegment.segment;
  } else {
    state.route = false;
    state.segment = 0;
  }

  state.currentSegment = currentSegment;
  state.nextSegment = nextSegment;

  state.range = state.end - state.start;

  return state;
}

function updateSegments() {
  return {
    type: ACTION_UPDATE_SEGMENTS
  };
}

function fetchSegmentMetadata(start, end, promise) {
  return {
    type: ACTION_LOAD_SEGMENT_METADATA,
    start,
    end,
    promise
  };
}

function insertSegmentMetadata(data) {
  return {
    type: ACTION_SEGMENT_METADATA,
    segments: segmentsFromMetadata(data),
    data
  };
}

function resolveAnnotation(annotation, event, route) {
  return {
    type: ACTION_RESOLVE_ANNOTATION,
    annotation,
    event,
    route
  };
}

function parseSegmentMetadata(state, segments, annotations) {
  let lastSegmentTime = 0;
  const routeStartTimes = {};
  segments = segments.map((segment) => {
    segment.offset = Math.round(segment.start_time_utc_millis) - state.start;
    if (!routeStartTimes[segment.canonical_route_name]) {
      const segmentNum = Number(segment.canonical_name.split('--')[2]);
      segment.segment = segmentNum;
      if (segmentNum > 0) {
        routeStartTimes[segment.canonical_route_name] = segment.offset - (SEGMENT_LENGTH * segmentNum);
      } else {
        routeStartTimes[segment.canonical_route_name] = segment.offset;
      }
      segment.routeOffset = routeStartTimes[segment.canonical_route_name];
    } else {
      segment.routeOffset = routeStartTimes[segment.canonical_route_name];
    }

    // if (lastSegmentTime && segment.canonical_route_name === 'df4d7c59724ab244|2018-07-31--17-31-27') {
    //   console.log('Segment length', segment.offset - lastSegmentTime, Object.keys(segment));
    // }
    lastSegmentTime = segment.offset;
    segment.duration = Math.round(segment.end_time_utc_millis - segment.start_time_utc_millis);
    segment.events = JSON.parse(segment.events_json) || [];
    const plannedDisengageEvents = segment.events.filter((event) => event.type === 'alert' && event.data && event.data.should_take_control);

    segment.events.forEach((event) => {
      event.timestamp = segment.start_time_utc_millis + event.offset_millis;
      // segment.start_time_utc_millis + event.offset_millis
      // segment.start_time_utc_millis - state.start + state.start

      event.canonical_segment_name = segment.canonical_name;
      annotations.forEach((annotation) => {
        // debugger;
        if (annotation.canonical_segment_name === event.canonical_segment_name
          && annotation.offset_millis === event.offset_millis
          && annotation.offset_nanos_part === event.offset_nanos) {
          if (event.id) {
            console.error('Server returned more than one matching annotation-to-event', event, annotation);
            debugger;
          }
          event.id = annotation.id;
          event.annotation = annotation;
        }
      });

      if (event.data && event.data.is_planned) {
        let reason;

        const alert = plannedDisengageEvents.reduce((closestAlert, alert) => {
          const closestAlertDiff = Math.abs(closestAlert.offset_millis - event.offset_millis);
          if (Math.abs(alert.offset_millis - event.offset_millis) < closestAlertDiff) {
            return alert;
          }
          return closestAlert;
        }, plannedDisengageEvents[0]);
        if (alert) {
          reason = alert.data.alertText2;
        } else {
          console.warn('Expected alert corresponding to planned disengagement', event);
          reason = 'Planned disengagement';
        }

        event.id = `planned_disengage_${event.time}`;
        event.annotation = {
          start_time_utc_millis: event.timestamp,
          data: {
            reason,
          },
          offset_nanos_part: event.offset_nanos,
          end_time_utc_millis: event.timestamp,
          canonical_segment_name: event.canonical_segment_name,
          dongle_id: state.dongleId,
          type: event.type,
          id: event.id,
          offset_millis: event.offset_millis
        };
      }
    });
    return segment;
  });

  return {
    start: state.start,
    dongleId: state.dongleId,
    end: state.end,
    segments
  };
}
function segmentsFromMetadata(segmentsData) {
  let curSegment = null;
  let curStopTime = null;
  let curVideoStartOffset = null;
  const segments = [];
  segmentsData.segments.forEach((segment) => {
    if (!segment.url) {
      return;
    }
    if (!(segment.proc_log === 40 || segment.proc_qlog === 40)) {
      return;
    }
    const segmentHasDriverCamera = (segment.proc_dcamera >= 0);
    const segmentHasDriverCameraStream = (segment.proc_dcamera === 40);
    const segmentHasVideo = (segment.proc_camera === 40);
    if (segmentHasVideo && curVideoStartOffset === null) {
      curVideoStartOffset = segment.offset;
    }
    /*
      route: '99c94dc769b5d96e|2018-04-09--11-29-08',
      offset: 41348000,
      duration: 214000,
      segments: 4
    */
    // if (curStopTime && segment.start_time_utc_millis - curStopTime > 10000) {
    //   // 10 seconds is *WAY* too much time xD
    //   curSegment = null;
    // }
    curStopTime = segment.start_time_utc_millis;
    if (!curSegment || curSegment.route !== segment.canonical_route_name) {
      if (curSegment) {
        finishSegment(curSegment);
      }
      let { url } = segment;
      const parts = url.split('/');

      if (Number.isFinite(Number(parts.pop()))) {
        // url has a number at the end
        url = parts.join('/');
      }
      curSegment = {
        offset: segment.offset - (segment.segment * SEGMENT_LENGTH),
        route: segment.canonical_route_name,
        startTime: segment.start_time_utc_millis,
        startCoord: [segment.start_lng, segment.start_lat],
        duration: 0,
        segments: 0,
        url: url.replace('chffrprivate.blob.core.windows.net', 'chffrprivate-vzn.azureedge.net'),
        events: [],
        videoAvailableBetweenOffsets: [],
        hasVideo: segmentHasVideo,
        deviceType: segment.devicetype,
        hpgps: segment.hpgps,
        hasDriverCamera: segmentHasDriverCamera,
        hasDriverCameraStream: segmentHasDriverCameraStream,
        locStart: '',
        locEnd: '',
        distanceMiles: 0.0,
        cameraStreamSegCount: 0,
        driverCameraStreamSegCount: 0,
      };
      segments.push(curSegment);
    }
    if (!segmentHasVideo && curVideoStartOffset !== null) {
      curSegment.videoAvailableBetweenOffsets.push([curVideoStartOffset, segment.offset]);
      curVideoStartOffset = null;
    }
    curSegment.hasVideo = (curSegment.hasVideo || segmentHasVideo);
    curSegment.hasDriverCamera = (curSegment.hasDriverCamera || segmentHasDriverCamera);
    curSegment.hasDriverCameraStream = (curSegment.hasDriverCameraStream || segmentHasDriverCameraStream);
    curSegment.hpgps = (curSegment.hpgps || segment.hpgps);
    curSegment.duration = (segment.offset - curSegment.offset) + segment.duration;
    curSegment.segments = Math.max(curSegment.segments, Number(segment.canonical_name.split('--').pop()) + 1);
    curSegment.events = curSegment.events.concat(segment.events);
    curSegment.endCoord = [segment.end_lng, segment.end_lat];
    curSegment.distanceMiles += segment.length;
    curSegment.cameraStreamSegCount += Math.floor(segmentHasVideo);
    curSegment.driverCameraStreamSegCount += Math.floor(segmentHasDriverCameraStream);
  });

  if (curSegment) {
    finishSegment(curSegment);
  }

  return segments;

  function finishSegment(segment) {
    let lastEngage = null;

    if (segment.hasVideo) {
      const lastVideoRange = segment.videoAvailableBetweenOffsets[segment.videoAvailableBetweenOffsets.length - 1] || [segment.offset, segment.offset + segment.duration];
      segment.videoAvailableBetweenOffsets = [
        ...segment.videoAvailableBetweenOffsets.slice(0, segment.videoAvailableBetweenOffsets.length - 1),
        [lastVideoRange[0], segment.offset + segment.duration]
      ];
    }
    segment.events = segment.events.sort((eventA, eventB) => {
      if (eventA.route_offset_millis === eventB.route_offset_millis) {
        return eventA.route_offset_nanos - eventB.route_offset_nanos;
      }
      return eventA.route_offset_millis - eventB.route_offset_millis;
    });
    segment.events.forEach((event) => {
      // NOTE sometimes theres 2 disengages in a row and that is NONSENSE
      switch (event.type) {
        case 'engage':
          lastEngage = event;
          break;
        case 'disengage':
          if (lastEngage) {
            lastEngage.data = {
              end_offset_nanos: event.offset_nanos,
              end_offset_millis: event.offset_millis,
              end_route_offset_nanos: event.route_offset_nanos,
              end_route_offset_millis: event.route_offset_millis
            };
          }
          break;
        default:
          break;
      }
    });
  }
}

function hasSegmentMetadata(state) {
  if (!state.segmentData) {
    console.log('No segment data at all');
    return false;
  }
  if (!state.segmentData.segments) {
    console.log('Still loading...');
    return false;
  }
  if (state.dongleId !== state.segmentData.dongleId) {
    console.log('Bad dongle id');
    return false;
  }
  if (state.start < state.segmentData.start) {
    console.log('Bad start offset');
    return false;
  }
  if (state.end > state.segmentData.end) {
    console.log('Bad end offset');
    return false;
  }
  if (state.end > state.segmentData.end) {
    console.log('Bad end offset');
    return false;
  }

  return state.start >= state.segmentData.start && state.end <= state.segmentData.end;
}

function hasCameraAtOffset(segment, offset) {
  return segment.videoAvailableBetweenOffsets.some((offsetInterval) => offset >= offsetInterval[0] && offset <= offsetInterval[1]);
}

function getNextSegment(state, offset) {
  if (offset === undefined) {
    offset = Playback.currentOffset(state);
  }
  if (!state.segments) {
    return null;
  }

  const { segments } = state;
  const lastSegment = null;

  for (let i = 0, len = segments.length; i < len; ++i) {
    const thisSegment = segments[i];
    // the next segment is after the offset, that means this offset is in a blank
    if (thisSegment.offset > offset) {
      return {
        url: thisSegment.url,
        route: thisSegment.route,
        segment: 0,
        routeOffset: thisSegment.offset,
        startOffset: thisSegment.offset,
        events: thisSegment.events,
        videoAvailableBetweenOffsets: thisSegment.videoAvailableBetweenOffsets,
        deviceType: thisSegment.deviceType,
        hpgps: thisSegment.hpgps,
        hasVideo: thisSegment.hasVideo,
        hasDriverCamera: thisSegment.hasDriverCamera,
        hasDriverCameraStream: thisSegment.hasDriverCameraStream,
        cameraStreamSegCount: thisSegment.cameraStreamSegCount,
        driverCameraStreamSegCount: thisSegment.driverCameraStreamSegCount,
        distanceMiles: thisSegment.distanceMiles,
      };
      break;
    }
    if (thisSegment.offset + thisSegment.duration > offset) {
      const segmentIndex = ~~((offset - thisSegment.offset) / SEGMENT_LENGTH);
      if (segmentIndex + 1 < thisSegment.segments) {
        return {
          url: thisSegment.url,
          route: thisSegment.route,
          segment: segmentIndex + 1,
          routeOffset: thisSegment.offset,
          startOffset: thisSegment.offset + (segmentIndex + 1) * SEGMENT_LENGTH,
          duration: thisSegment.duration,
          events: thisSegment.events,
          deviceType: thisSegment.deviceType,
          videoAvailableBetweenOffsets: thisSegment.videoAvailableBetweenOffsets,
          hpgps: thisSegment.hpgps,
          hasVideo: thisSegment.hasVideo,
          hasDriverCamera: thisSegment.hasDriverCamera,
          hasDriverCameraStream: thisSegment.hasDriverCameraStream,
          cameraStreamSegCount: thisSegment.cameraStreamSegCount,
          driverCameraStreamSegCount: thisSegment.driverCameraStreamSegCount,
          distanceMiles: thisSegment.distanceMiles,
        };
      }
    }
  }

  return null;
}

function getCurrentSegment(state, offset) {
  if (offset === undefined) {
    offset = Playback.currentOffset(state);
  }
  if (!state.segments) {
    return null;
  }

  const { segments } = state;

  for (let i = 0, len = segments.length; i < len; ++i) {
    const thisSegment = segments[i];
    // the next segment is after the offset, that means this offset is in a blank
    if (thisSegment.offset > offset) {
      break;
    }
    if (thisSegment.offset + thisSegment.duration > offset) {
      const segmentIndex = Math.floor((offset - thisSegment.offset) / SEGMENT_LENGTH);
      return {
        url: thisSegment.url,
        route: thisSegment.route,
        segment: segmentIndex,
        routeOffset: thisSegment.offset,
        startOffset: thisSegment.offset + segmentIndex * SEGMENT_LENGTH,
        duration: thisSegment.duration,
        events: thisSegment.events,
        deviceType: thisSegment.deviceType,
        videoAvailableBetweenOffsets: thisSegment.videoAvailableBetweenOffsets,
        hpgps: thisSegment.hpgps,
        hasVideo: thisSegment.hasVideo,
        hasDriverCamera: thisSegment.hasDriverCamera,
        hasDriverCameraStream: thisSegment.hasDriverCameraStream,
        cameraStreamSegCount: thisSegment.cameraStreamSegCount,
        driverCameraStreamSegCount: thisSegment.driverCameraStreamSegCount,
        distanceMiles: thisSegment.distanceMiles,
      };
    }
  }
  return null;
}

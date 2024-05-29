// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';
import { currentOffset } from '.';

export function reducer(_state, action) {
  let state = { ..._state };
  let loopOffset = null;
  if (state.zoom && state.zoom.start !== null) {
    loopOffset = state.zoom.start - state.filter.start;
  }
  switch (action.type) {
    case Types.ACTION_SEEK:
      state = {
        ...state,
        offset: action.offset,
        startTime: Date.now(),
      };

      if (loopOffset !== null) {
        if (state.offset < loopOffset) {
          state.offset = loopOffset;
        } else if (state.offset > (loopOffset + state.zoom.duration)) {
          state.offset = loopOffset + state.zoom.duration;
        }
      }
      break;
    case Types.ACTION_PAUSE:
      state = {
        ...state,
        offset: currentOffset(state),
        startTime: Date.now(),
        desiredPlaySpeed: 0,
      };
      break;
    case Types.ACTION_PLAY:
      if (action.speed !== state.desiredPlaySpeed) {
        state = {
          ...state,
          offset: currentOffset(state),
          desiredPlaySpeed: action.speed,
          startTime: Date.now(),
        };
      }
      break;
    case Types.ACTION_LOOP:
      if (action.start && action.end) {
        state.zoom = {
          start: action.start,
          end: action.end,
          duration: action.end - action.start,
        };
      } else {
        state.zoom = null;
      }
      break;
    case Types.ACTION_BUFFER_VIDEO:
      state = {
        ...state,
        isBufferingVideo: action.buffering,
        offset: currentOffset(state),
        startTime: Date.now(),
      };
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: true,
        offset: 0,
        startTime: Date.now(),
      };
      break;
    default:
      break;
  }

  if (state.currentRoute && state.currentRoute.videoStartOffset && state.zoom && state.zoom && state.filter
    && state.zoom.start === state.zoom.start && state.filter.start + state.currentRoute.offset === state.zoom.start) {
    const loopRouteOffset = state.zoom.start - state.zoom.start;
    if (state.currentRoute.videoStartOffset > loopRouteOffset) {
      state.zoom = {
        ...state.zoom,
        start: state.zoom.start + state.currentRoute.videoStartOffset,
        duration: state.zoom.duration - (state.currentRoute.videoStartOffset - loopRouteOffset),
      };
    }
  }

  // normalize over loop
  if (state.offset !== null && state.zoom?.start) {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    const offset = state.offset + (Date.now() - state.startTime) * playSpeed;
    loopOffset = state.zoom.start - state.filter.start;
    // has loop, trap offset within the loop
    if (offset < loopOffset) {
      state.startTime = Date.now();
      state.offset = loopOffset;
    } else if (offset > loopOffset + state.zoom.duration) {
      state.offset = ((offset - loopOffset) % state.zoom.duration) + loopOffset;
      state.startTime = Date.now();
    }
  }

  state.isBufferingVideo = Boolean(state.isBufferingVideo);

  return state;
}

// seek to a specific offset
export function seek(offset) {
  return {
    type: Types.ACTION_SEEK,
    offset,
  };
}

// pause the playback
export function pause() {
  return {
    type: Types.ACTION_PAUSE,
  };
}

// resume / change play speed
export function play(speed = 1) {
  return {
    type: Types.ACTION_PLAY,
    speed,
  };
}

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}

// update video buffering state
export function bufferVideo(buffering) {
  return {
    type: Types.ACTION_BUFFER_VIDEO,
    buffering,
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}

/* eslint-env jest */
const { asyncSleep } = require('../utils');
const Playback = require('./playback');
const { currentOffset } = require('./index');

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    filter: {
      start: Date.now(),
      end: Date.now() + 100000,
    },
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed... multiplier on speed
    offset: 0, // in miliseconds from the start
    startTime: Date.now(), // millisecond timestamp in which play began

    isBuffering: true,
  };
};

// make Date.now super stable for tests
let mostRecentNow = Date.now();
const oldNow = Date.now;
Date.now = function now() {
  return mostRecentNow;
};
function newNow() {
  mostRecentNow = oldNow();
  return mostRecentNow;
}

describe('playback', () => {
  it('has playback controls', async () => {
    newNow();
    let state = makeDefaultStruct();

    // should do nothing
    state = Playback.reducer(state, Playback.pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    // start playing, should set start time and such
    let playTime = newNow();
    state = Playback.reducer(state, Playback.play());
    // this is a (usually 1ms) race condition
    expect(state.startTime).toEqual(playTime);
    expect(state.desiredPlaySpeed).toEqual(1);

    await asyncSleep(100 + Math.random() * 200);
    // should update offset
    let ellapsed = newNow() - playTime;
    state = Playback.reducer(state, Playback.pause());

    expect(state.offset).toEqual(ellapsed);

    // start playing, should set start time and such
    playTime = newNow();
    state = Playback.reducer(state, Playback.play(0.5));
    // this is a (usually 1ms) race condition
    expect(state.startTime).toEqual(playTime);
    expect(state.desiredPlaySpeed).toEqual(0.5);

    await asyncSleep(100 + Math.random() * 200);
    // should update offset, playback speed 1/2
    ellapsed += (newNow() - playTime) / 2;
    expect(currentOffset(state)).toEqual(ellapsed);
    state = Playback.reducer(state, Playback.pause());

    expect(state.offset).toEqual(ellapsed);

    // seek!
    newNow();
    state = Playback.reducer(state, Playback.seek(123));
    expect(state.offset).toEqual(123);
    expect(state.startTime).toEqual(Date.now());
    expect(currentOffset(state)).toEqual(123);
  });

  it('should clamp loop when seeked after loop end time', () => {
    newNow();
    let state = makeDefaultStruct();

    // set up loop
    state = Playback.reducer(state, Playback.play());
    state = Playback.reducer(state, Playback.selectLoop(
      state.filter.start + 1000,
      state.filter.start + 2000,
    ));
    expect(state.loop.startTime).toEqual(state.filter.start + 1000);

    // seek past loop end boundary a
    state = Playback.reducer(state, Playback.seek(3000));
    expect(state.loop.startTime).toEqual(state.filter.start + 1000);
    expect(state.offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    newNow();
    let state = makeDefaultStruct();

    // set up loop
    state = Playback.reducer(state, Playback.play());
    state = Playback.reducer(state, Playback.selectLoop(
      state.filter.start + 1000,
      state.filter.start + 2000,
    ));
    expect(state.loop.startTime).toEqual(state.filter.start + 1000);

    // seek past loop end boundary a
    state = Playback.reducer(state, Playback.seek(0));
    expect(state.loop.startTime).toEqual(state.filter.start + 1000);
    expect(state.offset).toEqual(1000);
  });

  it('should buffer video and data', async () => {
    newNow();
    let state = makeDefaultStruct();

    state = Playback.reducer(state, Playback.play());
    expect(state.desiredPlaySpeed).toEqual(1);

    // claim the video is buffering
    state = Playback.reducer(state, Playback.bufferVideo(true));
    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.isBufferingVideo).toEqual(true);

    state = Playback.reducer(state, Playback.play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isBufferingVideo).toEqual(true);

    expect(state.desiredPlaySpeed).toEqual(0.5);

    state = Playback.reducer(state, Playback.play(2));
    state = Playback.reducer(state, Playback.bufferVideo(false));
    expect(state.desiredPlaySpeed).toEqual(2);
    expect(state.isBufferingVideo).toEqual(false);

    expect(state.desiredPlaySpeed).toEqual(2);
  });
});

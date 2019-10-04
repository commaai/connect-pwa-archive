// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import debounce from 'debounce';
import document from 'global/document';
import fecha from 'fecha';
import cx from 'classnames';
import { partial } from 'ap';

import Measure from 'react-measure';
import Tooltip from '@material-ui/core/Tooltip';
import { render } from 'react-dom';

import Thumbnails from './thumbnails';
import theme from '../../theme';
import TimelineWorker from '../../timeline';
import Segments from '../../timeline/segments';
import { selectRange } from '../../actions';

const styles = (theme) => ({
  base: {
    backgroundColor: '#1D2225',
    minHeight: '32px',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    '&.hasThumbnails.hasRuler': {
      minHeight: '80px',
    },
  },
  rounded: {
    borderRadius: '10px 10px 0px 0px'
  },
  segments: {
    position: 'absolute',
    top: '0px',
    left: '0px',
    width: '100%',
    height: '100%',
    '&.hasThumbnails': {
      height: '40%'
    },
    '&.hasThumbnails.hasRuler': {
      height: '100%',
    },
  },
  segment: {
    position: 'relative',
    height: '100%',
    background: theme.palette.states.drivingBlue,
  },
  ruler: {
    background: '#272D30d9',
    bottom: 0,
    position: 'absolute',
    top: 12,
    width: '100%',
  },
  rulerRemaining: {
    background: '#1D2225',
    borderLeft: '1px solid #D8DDDF',
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    opacity: 0.45,
    pointerEvents: 'none',
    width: '100%',
  },
  statusGradient: {
    background: 'linear-gradient(rgba(0, 0, 0, 0.0) 4%, rgba(255, 255, 255, 0.025) 10%, rgba(0, 0, 0, 0.1) 25%, rgba(0, 0, 0, 0.4))',
    height: 12,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  segmentColor: {
    position: 'absolute',
    display: 'inline-block',
    height: '100%',
    width: '100%',
    '&.active': {},
    '&.engage': {
      background: theme.palette.states.engagedGreen,
    },
    '&.alert': {
      '&.userPrompt': {
        background: theme.palette.states.alertOrange,
      },
      '&.critical': {
        background: theme.palette.states.alertRed,
      }
    }
  },
  uncoloredSegment: {
    background: theme.palette.states.drivingBlue,
    height: '100%',
    width: '100%',
  },
  hoverBead: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 50,
    height: '100%'
  },
  dragHighlight: {
    background: 'rgba(255, 255, 255, 0.1)',
    position: 'absolute',
    height: '100%',
  },
  thumbnails: {
    position: 'absolute',
    height: '60%',
    top: 12,
    width: '100%',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    '& img': {
      pointerEvents: 'none',
    },
    '&.hasRuler': {
      height: '30%',
    },
    '& > div': {
      display: 'inline-block'
    }
  },
});

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical'
];

class Timeline extends Component {
  constructor(props) {
    super(props);

    this.getOffset = this.getOffset.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.percentToOffset = this.percentToOffset.bind(this);
    this.renderSegment = this.renderSegment.bind(this);
    this.sendSeek = debounce(this.sendSeek.bind(this), 1000 / 60);


    this.offsetValue = React.createRef();
    this.rulerRemaining = React.createRef();
    this.rulerRemainingHovered = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();
    // this.canvas_speed = React.createRef();

    this.state = {
      dragStart: null,
      zoom: this.props.zoomOverride || this.props.zoom,
      mouseX: 0,
      hoverPercent: 0,
      isHovered: false,
      thumbnail: {
        height: 0,
        width: 0
      }
    };
  }

  componentWillReceiveProps(props) {
    this.setState({
      zoom: props.zoomOverride || props.zoom
    });
  }

  componentDidUpdate(prevProps, nextProps) {
    const minOffset = this.state.zoom.start - this.props.start;
    if (this.props.zoomOverride) {

    }
    // isn't needed with the reducers handling bounds
    // if (minOffset > TimelineWorker.currentOffset()) {
    //   TimelineWorker.seek(minOffset);
    // }
  }

  componentWillMount() {
    document.addEventListener('mouseup', this.handleMouseUp, false);
    this.stopListening = TimelineWorker.onIndexed(() => this.forceUpdate());
  }

  componentWillUnmount() {
    this.mounted = false;
    document.removeEventListener('mouseup', this.handleMouseUp, false);
    this.stopListening();
  }

  componentDidMount() {
    this.mounted = true;
    raf(this.getOffset);
  }

  getOffset() {
    if (!this.mounted) {
      return;
    }
    raf(this.getOffset);
    let offset = TimelineWorker.currentOffset();
    if (this.seekIndex) {
      offset = this.seekIndex;
    }
    offset = Math.floor(offset);
    const percent = this.offsetToPercent(offset);
    if (this.rulerRemaining.current && this.rulerRemaining.current.parentElement) {
      this.rulerRemaining.current.style.left = `${~~(10000 * percent) / 100}%`;
    }
    if (!this.state.isHovered && this.rulerRemainingHovered.current && this.rulerRemainingHovered.current.parentElement) {
      this.rulerRemainingHovered.current.style.left = `${~~(10000 * percent) / 100}%`;
    }
  }

  percentFromMouseEvent(e) {
    const boundingBox = e.currentTarget.getBoundingClientRect();
    const x = e.pageX - boundingBox.left;
    return x / boundingBox.width;
  }

  handleClick(e) {
    if (this.isDragSelecting) {
      console.log('Is a drag event');
      this.isDragSelecting = false;
      return;
    }
    if (this.props.noseek) {
      return;
    }
    const percent = this.percentFromMouseEvent(e);

    TimelineWorker.seek(this.percentToOffset(percent));
  }

  handleMouseDown(e) {
    const { classes } = this.props;
    if (!this.props.dragSelection) {
      return;
    }
    // make sure they're clicking & dragging and not just moving the mouse around
    if (e.currentTarget.parentElement.querySelector(`.${classes.base}:active`) !== e.currentTarget) {
      return;
    }

    const percent = this.percentFromMouseEvent(e);
    this.setState({
      dragStart: percent,
      dragEnd: percent
    });
  }

  handleMouseUp(e) {
    const { dragStart, dragEnd } = this.state;
    if (!this.props.dragSelection) {
      return;
    }
    if (!dragStart) {
      return;
    }
    const selectedArea = Math.abs(dragStart - dragEnd) * 100;
    const startPercent = Math.min(dragStart, dragEnd);
    const endPercent = Math.max(dragStart, dragEnd);
    const startOffset = Math.round(this.percentToOffset(startPercent));
    const endOffset = Math.round(this.percentToOffset(endPercent));

    if (selectedArea > 0.1) {
      const currentOffset = TimelineWorker.currentOffset();
      if (currentOffset < startOffset || currentOffset > endOffset) {
        TimelineWorker.seek(startOffset);
      }
      const startTime = startOffset + this.props.start;
      const endTime = endOffset + this.props.start;

      this.isDragSelecting = true;
      setTimeout(() => this.isDragSelecting = false);
      this.props.dispatch(selectRange(startTime, endTime));
    } else if (e.currentTarget !== document) {
      this.handleClick(e);
    }

    this.setState({
      dragStart: null,
      dragEnd: null
    });
  }

  handleMouseMove(e) {
    const boundingBox = e.currentTarget.getBoundingClientRect();
    const x = e.pageX - boundingBox.left;
    const percent = x / boundingBox.width;

    this.setState({
      mouseX: x,
      hoverPercent: percent,
      isHovered: true,
    });

    // mouseover highlight
    if (this.rulerRemainingHovered.current && this.rulerRemainingHovered.current.parentElement) {
      const hoverPercent = (this.state.hoverPercent * 100).toFixed(2);
      this.rulerRemainingHovered.current.style.left = `${hoverPercent}%`;
    }

    // drag highlight
    if (e.currentTarget.parentElement.querySelector(`.${this.props.classes.base}:active`) !== e.currentTarget) {
      return; // ignore mouseover
    }
    if (!this.props.dragSelection) {
      this.seekIndex = this.percentToOffset(percent);
      return this.sendSeek();
    } if (this.state.dragStart) {
      this.setState({
        dragEnd: percent
      });
    }
    // do other things for drag selection!
  }

  handleMouseLeave() {
    this.setState({ isHovered: false });
  }

  percentToOffset(perc) {
    const { zoom } = this.state;
    if (this.props.zoomed) {
      return perc * (zoom.end - zoom.start) + (zoom.start - this.props.start);
    }
    return perc * this.props.range;
  }

  offsetToPercent(offset) {
    const { zoom } = this.state;
    if (this.props.zoomed) {
      return (offset - (zoom.start - this.props.start)) / (zoom.end - zoom.start);
    }
    return offset / this.props.range;
  }

  sendSeek() {
    if (this.seekIndex) {
      TimelineWorker.seek(this.seekIndex);
      this.seekIndex = null;
    }
  }

  renderEventToCanvas(canvas, params, events, renderEvent) {
    const { width, height } = canvas.getBoundingClientRect();
  }

  render() {
    const {
      classes, hasThumbnails, tooltipped, hasRuler
    } = this.props;
    const hoverOffset = this.percentToOffset(this.state.hoverPercent);
    let timeString = null;
    if (tooltipped) {
      if (Number.isNaN(hoverOffset)) {
        timeString = 'N/A';
      } else {
        const timestampAtOffset = this.props.start + hoverOffset;
        timeString = fecha.format(timestampAtOffset, 'M/D HH:mm:ss');
      }
    }
    return (
      <div
        className={this.props.className}
        style={this.props.style}
      >
        <div
          className={cx(classes.base, {
            rounded: this.props.rounded,
            hasRuler: this.props.hasRuler,
            hasThumbnails: this.props.hasThumbnails,
          })}
          onMouseDown={this.handleMouseDown}
          onMouseUp={this.handleMouseUp}
          onMouseMove={this.handleMouseMove}
          onMouseLeave={this.handleMouseLeave}
          onClick={this.handleClick}
        >
          <div className={cx(classes.segments, { hasThumbnails, hasRuler })}>
            { this.props.segments && this.props.segments.map(this.renderSegment) }
            { this.props.hasRuler && (
              <div className={classes.ruler}>
                <div
                  ref={this.rulerRemaining}
                  className={classes.rulerRemaining}
                />
                <div
                  ref={this.rulerRemainingHovered}
                  className={classes.rulerRemaining}
                />
              </div>
            ) }
            { this.props.hasGradient && (
              <div
                className={cx(classes.statusGradient, {
                  hasRuler: this.props.hasRuler,
                })}
              />
            ) }
            { this.renderDragger() }
            { this.renderZoom() }
          </div>
          { tooltipped
            && (
            <Tooltip title={timeString}>
              <div
                ref={this.hoverBead}
                className={classes.hoverBead}
                style={{ left: this.state.mouseX - 25 }}
              />
            </Tooltip>
            )}
          { hasThumbnails
            && (
            <Measure
              bounds
              onResize={(rect) => this.setState({ thumbnail: rect.bounds })}
            >
              { (options) => (
                <div
                  ref={options.measureRef}
                  className={cx(this.props.classes.thumbnails, {
                    hasRuler: this.props.hasRuler,
                  })}
                >
                  <Thumbnails
                    getCurrentSegment={partial(Segments.getCurrentSegment, this.props)}
                    percentToOffset={this.percentToOffset}
                    thumbnail={this.state.thumbnail}
                    className={this.props.classes.thumbnail}
                    hasRuler={this.props.hasRuler}
                  />
                </div>
              )}
            </Measure>
            )}
        </div>
      </div>
    );
  }

  renderDragger() {
    const { dragStart, dragEnd } = this.state;
    const { dragSelection, classes } = this.props;
    if (!dragSelection || !dragStart) {
      return [];
    }
    const draggerStyle = {
      left: `${100 * Math.min(dragStart, dragEnd)}%`,
      width: `${100 * Math.abs(dragStart - dragEnd)}%`,
    };
    return (
      <div
        ref={this.dragBar}
        className={classes.dragHighlight}
        style={draggerStyle}
      />
    );
  }

  renderZoom() {
    const { zoom, classes } = this.props;
    if (!this.props.dragSelection || !zoom.expanded || this.props.zoomed) {
      return [];
    }
    const color = `${theme.palette.grey[50]}cc`;
    const endColor = `${theme.palette.grey[200]}aa`;
    const zoomStart = (zoom.start - this.props.start) / this.props.range;
    const zoomEnd = (zoom.end - this.props.start) / this.props.range;
    const barStyle = {
      background: `linear-gradient(to left,${color},${endColor},${color})`,
      left: `${100 * Math.min(zoomStart, zoomEnd)}%`,
      width: `${100 * Math.abs(zoomStart - zoomEnd)}%`,
    };
    return (
      <div
        style={barStyle}
      />
    );
  }

  renderSegment(segment) {
    const { classes } = this.props;
    let startPerc = 100 * segment.offset / this.props.range;
    let widthPerc = 100 * segment.duration / this.props.range;
    if (this.props.zoomed) {
      const startOffset = this.state.zoom.start - this.props.start;
      const endOffset = this.state.zoom.end - this.props.start;
      const zoomDuration = endOffset - startOffset;
      if (segment.offset > endOffset) {
        return;
      }
      if (segment.offset + segment.duration < startOffset) {
        return;
      }
      startPerc = 100 * (segment.offset - startOffset) / zoomDuration;
      widthPerc = 100 * segment.duration / zoomDuration;
    }
    const style = {
      position: 'absolute',
      width: `${widthPerc}%`,
      left: `${startPerc}%`,
    };
    return (
      <div
        key={segment.route + segment.offset}
        className={classes.segment}
        style={style}
      >
        { this.props.colored ? this.renderSegmentEvents(segment) : (
          <div className={classes.uncoloredSegment} />
        ) }
      </div>
    );
  }

  renderSegmentEvents(segment) {
    const { classes } = this.props;
    return segment.events
      .filter((event) => event.data && event.data.end_route_offset_millis)
      .map((event, i) => {
        const style = {
          left: `${(event.route_offset_millis / segment.duration) * 100}%`,
          width: `${((event.data.end_route_offset_millis - event.route_offset_millis) / segment.duration) * 100}%`,
        };
        if (localStorage.showCurrentEvent) {
          const time = TimelineWorker.currentOffset();
          const eventStart = event.route_offset_millis + segment.offset;
          const eventEnd = event.data.end_route_offset_millis + segment.offset;
          if (time > eventStart && time < eventEnd) {
            console.log('Current event:', event);
          }
        }
        return (
          <div
            key={segment.route + i}
            style={style}
            className={cx(classes.segmentColor, event.type, {
              [`${AlertStatusCodes[event.data.alertStatus]}`]: event.data.alertStatus,
            })}
          />
        );
      });
  }
}

export default connect(mapStateToProps)(withStyles(styles)(Timeline));

function mapStateToProps(state) {
  return {
    ...state.workerState,
    zoom: state.zoom
  };
}

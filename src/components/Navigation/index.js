import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import debounce from 'debounce';
import ReactMapGL, { GeolocateControl, HTMLOverlay, Marker, FlyToInterpolator, Source,
  WebMercatorViewport, Layer} from 'react-map-gl';
import { withStyles, TextField, InputAdornment, Typography, Button } from '@material-ui/core';
import { Search, Room } from '@material-ui/icons';
import Colors from '../../colors';
import GeocodeApi, { MAPBOX_TOKEN } from '../../api/geocode';
import { athena as Athena, devices as Devices } from '@commaai/comma-api';
import { car_pin } from '../../icons';

const MAP_STYLE = 'mapbox://styles/commaai/cjj4yzqk201c52ss60ebmow0w';
const styles = () => ({
  mapContainer: {
    transition: 'height 0.2s',
    borderBottom: `1px solid ${Colors.white10}`,
  },
  geolocateControl: {
    display: 'none',
  },
  overlay: {
    color: Colors.white,
    borderRadius: 22,
    padding: '12px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    maxHeight: 'calc(60vh - 20px)',
    display: 'flex',
    flexDirection: 'column',
  },
  overlayTextfield: {
    borderRadius: 0,
    '& input': { padding: 0 }
  },
  overlaySearchButton: {
    color: Colors.white30,
  },
  overlaySearchResults: {
    marginTop: 5,
    borderTop: `1px solid ${Colors.white20}`,
    flexGrow: 1,
    overflow: 'auto',
  },
  overlaySearchItem: {
    cursor: 'pointer',
    marginTop: 15,
  },
  overlaySearchDetails: {
    color: Colors.white40,
  },
  searchPin: {
    cursor: 'pointer',
    fontSize: 36,
    color: '#31a1ee',
  },
  searchSelect: {
    fontSize: 36,
    color: '#31a1ee',
  },
  searchSelectBox: {
    borderRadius: 22,
    padding: '12px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    color: Colors.white,
    display: 'flex',
    flexDirection: 'column',
  },
  searchSelectBoxHeader: {
    display: 'flex',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    '& > p': {
      fontWeight: 600,
    },
  },
  searchSelectButton: {
    marginLeft: 10,
    backgroundColor: Colors.white,
    color: Colors.grey800,
    borderRadius: 22,
    borderRadius: 30,
    color: '#404B4F',
    textTransform: 'none',
    minHeight: 'unset',
    '&:hover': {
      background: '#ddd',
      color: '#404B4F',
    },
    '&:disabled': {
      background: '#ddd',
      color: '#404B4F',
    },
  },
  searchSelectBoxDetails: {
    color: Colors.white40,
  },
  carPin: {
    width: 36,
    height: 36,
  },
});

class Navigation extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasFocus: false,
      viewport: {
        longitude: -122.45,
        latitude: 37.78,
        zoom: 0,
      },
      carOnline: true,
      carLocation: null,
      carLocationTime: null,
      geoLocateCoords: null,
      search: null,
      route: null,
      searchSelect: null,
    };

    this.searchInputRef = React.createRef();

    this.flyToMarkers = this.flyToMarkers.bind(this);
    this.renderOverlay = this.renderOverlay.bind(this);
    this.renderSearchOverlay = this.renderSearchOverlay.bind(this);
    this.onGeolocate = this.onGeolocate.bind(this);
    this.onSearch = this.onSearch.bind(this);
    this.onSearchSelect = this.onSearchSelect.bind(this);
    this.focus = this.focus.bind(this);
    this.updateDevice = this.updateDevice.bind(this);
    this.formatDistance = this.formatDistance.bind(this);
    this.formatDuration = this.formatDuration.bind(this);

    this.updateDeviceInterval = null;
  }

  componentDidMount() {
    this.componentDidUpdate({});
    this.updateDeviceInterval = setInterval(this.updateDevice, 10000);
  }

  componentWillUnmount() {
    if (this.updateDeviceInterval) {
      clearInterval(this.updateDeviceInterval);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const { dongleId } = this.props;
    const { geoLocateCoords, search, carLocation, searchSelect } = this.state;

    if ((searchSelect && prevState.searchSelect !== searchSelect) ||
      (search && prevState.search !== search) ||
      (carLocation && prevState.carLocation !== carLocation) ||
      (geoLocateCoords && prevState.geoLocateCoords !== geoLocateCoords))
    {
      this.flyToMarkers();
    }

    if (prevProps.dongleId !== dongleId) {
      this.setState({
        carOnline: true,
        carLocation: null,
        carLocationTime: null,
      });
      this.updateDevice();
    }
  }

  updateDevice() {  // TODO debounce
    const { dongleId } = this.props;

    // get last known location
    Devices.fetchLocation(dongleId).then((resp) => {
      this.setState({
        carLocation: [resp.lng, resp.lat],
        carLocationTime: resp.time,
      });
    }).catch(console.log);

    // see if device can be reached
    const payload = {
      method: "getMessage",
      params: { service: "deviceState", timeout: 3000 },
      jsonrpc: "2.0",
      id: 0,
    };

    Athena.postJsonRpcPayload(dongleId, payload).then((resp) => {
      this.setState({ carOnline: resp.result });
    }).catch(() => {
      this.setState({ carOnline: false });
    });
  }

  onGeolocate(pos) {
    if (pos && pos.coords) {
      this.setState({ geoLocateCoords: [pos.coords.longitude, pos.coords.latitude] });
    }
  }

  async onSearch(ev) {  // TODO debounce
    this.focus();
    if (ev.target.value.length >= 3) {
      const proximity = this.state.carLocation || this.state.geoLocateCoords || undefined;
      const features = await GeocodeApi().forwardLookup(ev.target.value, proximity);
      this.setState({ searchSelect: null, search: features });
    } else {
      this.setState({ searchSelect: null, search: null });
    }
  }

  onSearchSelect(item) {
    console.log(item);
    this.setState({ searchSelect: item, search: null });
    if (this.state.carLocation) {
      GeocodeApi().getDirections([this.state.carLocation, item.center]).then((route) => {
        this.setState({ searchSelect: {
          ...item,
          route: route[0],
        }});
      });
    }
  }

  flyToMarkers() {
    const { geoLocateCoords, search, searchSelect, carLocation } = this.state;

    const bounds = [];
    if (geoLocateCoords) {
      bounds.push([geoLocateCoords, geoLocateCoords]);
    }
    if (carLocation) {
      bounds.push([carLocation, carLocation]);
    }
    if (searchSelect) {
      bounds.push(searchSelect.bbox ?
        [searchSelect.bbox.slice(0, 2), searchSelect.bbox.slice(2, 4)] :
        [searchSelect.center, searchSelect.center]
      );
    }
    if (search) {
      search.forEach((item) => bounds.push(
        item.bbox ? [item.bbox.slice(0, 2), item.bbox.slice(2, 4)] : [item.center, item.center]
      ));
    }

    if (bounds.length) {
      const bbox = [[
        Math.min.apply(null, bounds.map((e) => e[0][0])),
        Math.min.apply(null, bounds.map((e) => e[0][1])),
      ], [
        Math.max.apply(null, bounds.map((e) => e[1][0])),
        Math.max.apply(null, bounds.map((e) => e[1][1])),
      ]];

      this.setState({
        viewport: new WebMercatorViewport(this.state.viewport).fitBounds(bbox, { padding: 50, maxZoom: 10 })
      });
    }
  }

  focus() {
    if (!this.state.hasFocus) {
      this.setState({ hasFocus: true });
    }
  }

  formatDistance(meters) {
    const { searchSelect } = this.state;

    let metric = false;
    if (searchSelect && searchSelect.context) {
      const country = searchSelect.context[searchSelect.context.length - 1];
      if (country.id.substr(0, 7) === 'country' && country.short_code !== 'us' && country.short_code !== 'gb') {
        metric = true;
      }
    }
    if (metric) {
      return (meters / 1000.0).toFixed(1) + " km";
    }
    return (meters / 1609.34).toFixed(1) + " mi";
  }

  formatDuration(seconds) {
    let mins = Math.round(seconds / 60.0);
    let res = '';
    if (mins >= 60) {
      const hours = Math.floor(mins / 60.0);
      mins -= hours * 60;
      res += `${hours} hr `;
    }
    return `${res}${mins} min`;
  }

  render() {
    const { classes } = this.props;
    const { hasFocus, search , searchSelect, carLocation, carOnline, viewport } = this.state;

    return (
      <div className={ classes.mapContainer } style={{ height: hasFocus ? '60vh' : 150 }}>
        <ReactMapGL { ...viewport } onViewportChange={ (viewport) => this.setState({ viewport }) }
          mapStyle={ MAP_STYLE } width="100%" height="100%" onNativeClick={ this.focus } maxPitch={ 0 }
          mapboxApiAccessToken={ MAPBOX_TOKEN } attributionControl={ false } ref={ this.initMap } >
          <GeolocateControl className={ classes.geolocateControl } positionOptions={{ enableHighAccuracy: true }}
            showAccuracyCircle={ false } onGeolocate={ this.onGeolocate } auto fitBoundsOptions={{ maxZoom: 10 }}
            trackUserLocation={true} onViewportChange={ this.flyToMarkers } />
          { searchSelect && searchSelect.route &&
            <Source id="my-data" type="geojson" data={ searchSelect.route.geometry }>
              <Layer type="line" layout={{ 'line-cap': 'round', 'line-join': 'bevel' }}
                paint={{ 'line-color': '#31a1ee', 'line-width': 3, 'line-blur': 1 }}  />
            </Source>
          }
          { carLocation && carOnline &&
            <Marker latitude={ carLocation[1] } longitude={ carLocation[0] } offsetLeft={ -18 } offsetTop={ -33 }>
              <img className={ classes.carPin } src={ car_pin } />
            </Marker>
          }
          { search && search.map((item) =>
            <Marker latitude={ item.center[1] } longitude={ item.center[0] } key={ item.id }
            offsetLeft={ -18 } offsetTop={ -33 }>
              <Room classes={{ root: classes.searchPin }} onClick={ () => this.onSearchSelect(item) } />
            </Marker>
          )}
          { searchSelect &&
            <Marker latitude={ searchSelect.center[1] } longitude={ searchSelect.center[0] }
              offsetLeft={ -18 } offsetTop={ -33 }>
              <Room classes={{ root: classes.searchSelect }}/>
            </Marker>
          }
          <HTMLOverlay redraw={ this.renderOverlay } style={{ width: 330, height: 'unset', top: 10, left: 10 }}
            captureScroll={ true } captureDrag={ true } captureClick={ true } captureDoubleClick={ true }
            capturePointerMove={ true } />
          { searchSelect &&
            <HTMLOverlay redraw={ this.renderSearchOverlay } captureScroll={ true } captureDrag={ true }
              captureClick={ true } captureDoubleClick={ true } capturePointerMove={ true }
              style={{ width: 330, height: 'unset', top: 'auto', bottom: 10, left: 10 }} />
          }
        </ReactMapGL>
      </div>
    );
  }

  renderOverlay() {
    const { classes } = this.props;

    return (
      <div className={ classes.overlay } onClick={ this.focus }>
        <TextField onChange={ this.onSearch } fullWidth={ true } inputRef={ this.searchInputRef }
          disabled={ !this.state.carOnline } placeholder={ this.state.carOnline ? "search" : "device not online" }
          InputProps={{
            classes: { root: classes.overlayTextfield },
            endAdornment: this.state.carOnline ?
              ( <InputAdornment position="end"><Search className={ classes.overlaySearchButton } /></InputAdornment> ) :
              null
          }} />
        { this.state.search &&
          <div className={ classes.overlaySearchResults }>
            { this.state.search.map((item) => (
              <div key={ item.id } className={ classes.overlaySearchItem } onClick={ () => this.onSearchSelect(item) }>
                <Typography>
                  { item.text }
                  <span className={ classes.overlaySearchDetails }>{ item.place_name.substr(item.text.length) }</span>
                </Typography>
              </div>
            )) }
          </div>
        }
      </div>
    );
  }

  renderSearchOverlay() {
    const { classes } = this.props;
    const { searchSelect, carOnline } = this.state;

    return (
      <div className={ classes.searchSelectBox }>
        <div className={ classes.searchSelectBoxHeader }>
          <div>
            <Typography>{ searchSelect.text }</Typography>
            { searchSelect.route &&
              <Typography className={ classes.searchSelectBoxDetails }>
                { this.formatDistance(searchSelect.route.distance) } (
                { this.formatDuration(searchSelect.route.duration) })
              </Typography>
            }
          </div>
          <Button disabled={ !carOnline || !searchSelect.route } classes={{ root: classes.searchSelectButton }}>
            navigate
          </Button>
        </div>
        <Typography className={ classes.searchSelectBoxDetails }>
          { searchSelect.place_name.substr(searchSelect.text.length + 2) }
        </Typography>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
});

export default connect(stateToProps)(withStyles(styles)(Navigation));

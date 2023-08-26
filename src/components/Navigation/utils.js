export function formatDistance(meters, metric) {
  if (metric) {
    return `${(meters / 1000.0).toFixed(1)} km`;
  }
  return `${(meters / 1609.34).toFixed(1)} mi`;
}

export function formatRouteDistance(route) {
  let metric = true;
  try {
    route.legs[0].admins.forEach((adm) => {
      if (['US', 'GB'].includes(adm.iso_3166_1)) {
        metric = false;
      }
    });
  } catch (err) {
    metric = false;
  }

  return formatDistance(route.distance, metric);
}

export function formatDuration(seconds) {
  let mins = Math.round(seconds / 60.0);
  let res = '';
  if (mins >= 60) {
    const hours = Math.floor(mins / 60.0);
    mins -= hours * 60;
    res += `${hours} hr `;
  }
  return `${res}${mins} min`;
}

export function formatRouteDuration(route) {
  return formatDuration(route.duration_typical);
}

export function formatPlaceName(item) {
  if (item.resultType === 'place' || item.resultType === 'car') {
    return item.title;
  }
  return item.title.split(',', 1)[0];
}

/**
 * @param {*} item
 * @param {'none'|'state'|'all'} details
 * @returns {string}
 */
export function formatPlaceAddress(item, details = 'all') {
  let res;

  if (['street', 'city'].some((key) => !item.address[key])) {
    res = item.address.label;
  } else {
    if (!item.resultType) console.warn('formatSearchAddress: missing resultType', item);

    res = '';
    if (details === 'all' || ['car', 'place'].includes(item.resultType)) {
      const { houseNumber, street } = item.address;
      if (houseNumber) res += `${houseNumber} `;
      res += `${street}, `;
    }
    const { city, stateCode, postalCode, countryName } = item.address;
    res += `${city}`;
    if (['state', 'all'].includes(details)) {
      res += ',';
      if (stateCode) res += ` ${stateCode}`;
      res += ` ${postalCode}`;
      if (details === 'all' && countryName) res += `, ${countryName}`;
    }
  }

  // NOTE: this is a hack to remove the name from the address. it's necessary
  //       for cases where we only have the address label, without individual
  //       address components (search results and favourites).
  if (details !== 'all') {
    const name = formatPlaceName(item);
    if (res.startsWith(name)) res = res.substring(name.length + 2);
  }

  return res;
}

export function formatSearchList(item) {
  const address = formatPlaceAddress(item, 'none');
  return `, ${address} (${formatDistance(item.distance)})`;
}

// Declare globals and defaults
const markers_array = []; // Array to hold markers so they can be cleared as an overlay
let mc;
let tabCount = -1;
const earthRadius = 3963.0; // Radius of the earth in statute miles
let lat = 47.6062; // Default location (Seattle, WA)
let lon = -122.3321;
const d = new Date(); // Date variable for Flickr API call (one month before today)
d.setDate(d.getDate() - 30);
const month = d.getMonth()+1;
const day = d.getDate();
const fDate = d.getFullYear() + '-' + (month<10 ? '0' : '') + month + '-' + (day<10 ? '0' : '') + day;
let map, infoWindow;
let refreshPosts = true; // By default, user actions should trigger a new Flickr response, one without tag filters
const specificColorDefaults = ['#000000', '#777777', '#ffffff']; // Defaults for map styling
let current_style = map_styles.hopper; // Default map style and colors
let style_keys = []; // Sort through map_styles.js object and arrange in alphabetical order
for (let prop in map_styles) {
    style_keys.push(prop);
}
style_keys.sort();

function initMap() { // Initialize Google Map before jQuery's document ready method
    mapOptions = {
        center: new google.maps.LatLng(lat, lon), // Location
        zoom: 14, // Zoom level (0 to 20 with 0 being the entire world)
        mapTypeId: google.maps.MapTypeId.ROADMAP, // One of three types of maps: ROADMAP, TERRAIN, SATELLITE
        styles: current_style, // Select a style from the style array
        // Customized controls
        zoomControl: true,
        mapTypeControl: false,
        scaleControl: false,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false
    };
    map = new google.maps.Map(document.getElementById('map'), mapOptions);
    // Create a new InfoWindow object that does not autopan the map when a marker is clicked
    infoWindow = new google.maps.InfoWindow({
        maxWidth: '300',
        maxHeight: '100',
        disableAutoPan: true,
        boxStyle: {
            width: '300px',
            height: '100px'
        }
    });
    $('#map').css('height', $(window).height() - 50); // adjust map height per top nav
    google.maps.event.addListener(map, 'idle', () => { // When user action ends, clear markers and update posts if appropriate
        if (refreshPosts) {
            clear_markers();
            update_posts();
        }
    });
    let input = document.getElementById('pac-input');
    let autocomplete = new google.maps.places.Autocomplete(input, {placeIdOnly: true});
    autocomplete.bindTo('bounds', map);
    let geocoder = new google.maps.Geocoder;
    autocomplete.addListener('place_changed', () => { // Allow autocomplete when looking up a map location
      let place = autocomplete.getPlace();
      if (!place.place_id) {
        return;
      }
      geocoder.geocode({'placeId': place.place_id}, (results, status) => {
        if (status !== 'OK') {
          window.alert('Geocoder failed due to: ' + status);
          return;
        }
        map.setZoom(14);
        map.setCenter(results[0].geometry.location);
      });
    });
}

$(function() { // On document ready (after map initialization)
    $.each( style_keys, ( i, val ) => { // Strip colors from Snazzy Maps JSON data
        let style_colors = [];
        $.each(map_styles[val], (j, v) => {
            $.each(v, (k, w) => {
                if (k === 'stylers') {
                    $.each(w, (l, x) => {
                        if (x.color && style_colors.indexOf(x.color) < 0) {
                            style_colors.push(x.color);
                        } else if (x.hue && style_colors.indexOf(x.hue) < 0) {
                            style_colors.push(x.hue);
                        }
                    });
                }
            });
        });
        style_colors.sort();
        if (map_styles[val] === current_style) { // Use the default map style to set the colors of the app
            update_global_colors(style_colors);
        }
        // Make Map Style name reader friendly and add to select list
        let key_name = val.replace(/_/g, ' ');
        key_name = key_name.charAt(0).toUpperCase() + key_name.slice(1);
        $('#map_styles').append(`<li><a data-mapstyle="${val}" data-mapcolors="${style_colors.join()}" href="#">${key_name}</a></li>`);
    });
    $('#map_styles').append('<li class="divider"></li>');
    $('#map_styles').append('<li><a href="http://snazzymaps.com" target="_new">More styles</a></li>');
    $('#map_styles').css('height', $(window).height() - 50); // adjust map height per top nav
    // Add checkmark icon to default default style in dropdown
    $('#map_styles a[data-mapstyle=flat_map]').append('<span id="selected-dropdown-item" class="glyphicon glyphicon-ok"></span>');
    // Delegate click listener for map styles dropdown
    $('#map_styles').on('click', 'a[data-mapstyle]', function() {
        let style_name = $(this).data('mapstyle');
        current_style = map_styles[style_name];
        let map_colors = $(this).data('mapcolors');
        let style_colors = map_colors.split(',');
        update_global_colors(style_colors);
        $('span#selected-dropdown-item').remove(); // Remove checkmark icon from previously selected style
        // Append checkmark icon to show selected style
        $(this).append('<span id="selected-dropdown-item" class="glyphicon glyphicon-ok"></span>');
        mapOptions.styles = current_style;
        mapOptions.zoom = map.getZoom();
        mapOptions.center = map.getCenter();
        map.setOptions(mapOptions);
    });
    document.addEventListener('keydown', e => { // Tab to cycle through posts
        if (e.keyCode == '9') {
            e.preventDefault(); // Prevent tab default
            if (e.shiftKey && markers_array.length > 0 && tabCount > 0) {
                tabCount --;
                google.maps.event.trigger(markers_array[tabCount], 'click');
            } else if (markers_array.length > 0 && tabCount < (markers_array.length - 1) && e.shiftKey === false) {
                tabCount++;
                google.maps.event.trigger(markers_array[tabCount], 'click');
            }
        }
    });
    // Flickr tag search
    $('#btn_tags').on('click', e => {
        e.preventDefault(); // Don't refresh page
        clear_markers();
        update_posts();
    });
});

// Add markers to map and populate info window for each
const add_marker = item => {
    let markerOptions = {
        position: new google.maps.LatLng(item.latitude, item.longitude),
        optimized: false
    };
    let marker = new google.maps.Marker(markerOptions);
    marker.setIcon('img/marker.png');
    let postSrc = `http://farm${item.farm}.static.flickr.com/${item.server}/${item.id}_${item.secret}_t.jpg`;
    let postHtml = `<div class="card"><div class="user"><a href="https://flickr.com/photos/${item.owner}/${item.id}" target="_new"><img src="${postSrc}"></a></div><div class="post"><b>${item.title}</b><br />taken ${item.datetaken.split(' ')[0]}<br />by <a href="https://flickr.com/people/${item.owner}" target="_new">"${item.ownername}</a><br />with ${item.views}views<div class="desc">${item.description._content}</div><div class="tags">${item.tags}</div></div></div>`;
    // When user clicks on a a marker...
    google.maps.event.addListener(marker, 'click', function() {
        refreshPosts = false;
        marker.setAnimation(null);
        marker.setIcon('img/marker-gray.png');
        infoWindow.setContent(postHtml);
        infoWindow.open(map, this);
        map.setCenter(marker.getPosition());
        let iw_container = $('.gm-style-iw').parent();
        iw_container.stop().hide();
        iw_container.fadeIn(400);
        google.maps.event.removeListener(mouseoverHandle);
    });
    // When user mouses out of the marker...
    let mouseoverHandle = google.maps.event.addListener(marker, 'mouseout', () => {
        infoWindow.close(); 
        refreshPosts = true;
    });
    // When the user mouses over the marker...
    google.maps.event.addListener(marker, 'mouseover', function() {
        infoWindow.setContent(postHtml);
        infoWindow.open( map, this);
        let iw_container = $('.gm-style-iw').parent();
        iw_container.stop().hide();
        iw_container.fadeIn(400);
    });
    // Clicking the map should close the info window and allow user actions to update Flickr results
    google.maps.event.addListener(map, 'click', () => {
        infoWindow.close(); 
        refreshPosts = true;
    });
    // When the user resizes the browser window...
    google.maps.event.addDomListener(window, 'resize', () => {
        infoWindow.close(); 
        refreshPosts = true;
        $('#map').css('height', $(window).height() - 50);
    });
    // When the user zooms on the map...
    google.maps.event.addListener(map, 'zoom_changed', () => {
        infoWindow.close(); 
        refreshPosts = true;
    });
    markers_array.push(marker);
}

const clear_markers = () => { // Clear all markers
    for (let i = 0; i < markers_array.length; i++ ) {
        markers_array[i].setMap(null);
    }
    markers_array.length = 0;
    if ('undefined' !== typeof mc) {
        mc.clearMarkers();
    }
}

// Update the Flickr feed (based on map location and zoom)
const get_posts = (lat, lon, radius) => {
    $.ajax({
        url: `https://api.flickr.com/services/rest/?method=flickr.photos.search&api_key=1a2a736dc73604e5c6f6e838d8bf9eb0&lat=${lat}&lon=${lon}&sort=date-posted-desc&per_page=500&min_upload_date=${fDate}&radius=${radius}&radius_type=mi&tags=${$('#txt_tags').val()}&extras=geo,views,date_uploaded,date_taken,owner_name,tags,description&format=json&jsoncallback=?`,
        dataType: 'jsonp',
        beforeSend: () => {
            $('#loader').stop().html('<img src="img/loader.gif" /><div>Fetching data...</div>').fadeIn(1000);
        },
        success: response => {
            let counter = 0;
            $('#loader').fadeOut(1000); // Flickr loading GIF
            if (response.photos.photo) {
                $.each(response.photos.photo, (index, item) => {
                    try {
                        add_marker(item);
                        counter += 1;
                    } catch (e) {
                    }
                });
            }
            tabCount = -1;
            let mcOptions = { // Marker clusters for many results
                gridSize: 50,
                maxZoom: 18,
                styles: [{
                    textSize: 12,
                    textColor: '#FFFFFF',
                    height: 53,
                    url: 'https://raw.githubusercontent.com/googlemaps/v3-utility-library/master/markerclustererplus/images/m1.png',
                    width: 53
                }]
            };
            mc = new MarkerClusterer(map, markers_array, mcOptions);
            toastr.options = {
                'positionClass': 'toast-bottom-left'
            };
            toastr.info('Showing '  + counter + ' posts found in this area.');
        }
    });
}

// Refresh the map using the end-user's users geolocation
const handle_geolocation_query = position => {
    let center = new google.maps.LatLng( position.coords.latitude, position.coords.longitude );
    map.setCenter(center);
}

const hex_to_rgb = hex => { // Snazzy maps JSON is hex, but jQuery's CSS method prefers RGB
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

const initiate_geolocation = () => {
    navigator.geolocation.getCurrentPosition(handle_geolocation_query);
}

const update_global_colors = style_colors_array => { // App colors should reflect the Snazzy Map selected
    let increment = Math.round(style_colors_array.length / 3);
    let specificColors = [];
    if (increment < 1) { // If this particular Snazzy Map has few colors, use the defaults (black, gray, and white)
        specificColors = [specificColorDefaults[0], specificColorDefaults[1], specificColorDefaults[2]];
    } else {
        specificColors = [];
        for (let i = 0; i < 3; i++) { // Pick three colors from the Snazzy Map JSON, preferably one dark, one medium, and one light for legibility
            if (style_colors_array[((i+1)*increment)-increment]) {
                specificColors[i] = style_colors_array[i];
            } else if (((i+1)*increment)-increment === style_colors_array.length && style_colors_array[style_colors_array.length-1] !== specificColors[i-1]) {
                specificColors[i] = style_colors_array[style_colors_array.length-1];
            } else {
                specificColors[i] = specificColorDefaults[i];
            }
        }
    }
    // Check the colors chosen. If two are similar, use default(s) as a fallback. Then convert from hex to RBG for jQuery
    if (parseInt(specificColors[1].replace('#', '0x'), 16) - parseInt(specificColors[0].replace('#', '0x'), 16) < 750000 && parseInt(specificColors[1].replace('#', '0x'), 16) < 750000) {
        specificColors[1] = specificColorDefaults[1];
    } else if (parseInt(specificColors[1].replace('#', '0x'), 16) - parseInt(specificColors[0].replace('#', '0x'), 16) < 750000) {
        specificColors[0] = specificColorDefaults[0];
    } else if (parseInt(specificColors[2].replace('#', '0x'), 16) - parseInt(specificColors[1].replace('#', '0x'), 16) < 750000) {
        specificColors[2] = specificColorDefaults[2];
    }
    // dark || black
    let dC = `rgb(${hex_to_rgb(specificColors[0]).r}, ${hex_to_rgb(specificColors[0]).g}, ${hex_to_rgb(specificColors[0]).b})`;
    $('.navbar-inverse').css('background-color', dC);
    $('#loader div').css('color', dC);
    $('.btn-default').css('color', dC);
    $('input.form-control').css('color', dC);
    // middle color || gray
    let mC = `rgb(${hex_to_rgb(specificColors[1]).r}, ${hex_to_rgb(specificColors[1]).g}, ${hex_to_rgb(specificColors[1]).b})`;
    $('.navbar-inverse .navbar-brand').css('color', mC);
    $('.glyphicon').css('color', mC);
    $('.btn-default:hover').css('background-color', mC);
    $('a.dropdown-toggle').css('color', mC);
    // light || white
    let lC = `rgb(${hex_to_rgb(specificColors[2]).r}, ${hex_to_rgb(specificColors[2]).g}, ${hex_to_rgb(specificColors[2]).b})`;
    $('.toast-message').css('color', lC);
    $('input.form-control').css('background-color', lC);
    $('.btn-default').css('background-color', lC);
}

const update_posts = () => { // Grab current map state before making Flickr call
    let bounds = map.getBounds(); // Get the bounds of the viewable region (in miles)
    let center = bounds.getCenter();
    let ne = bounds.getNorthEast();
    // Convert lat or lng from decimal degrees to radians by dividing by 57.2958
    let lat1 = center.lat() / 57.2958; 
    let lon1 = center.lng() / 57.2958;
    let lat2 = ne.lat() / 57.2958;
    let lon2 = ne.lng() / 57.2958;
    // Calculate the distance of the radius (center to Northeast corner of its bounds)
    let radius = earthRadius * Math.acos(Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1));
    let position = map.getCenter(); // Center of the map
    let posLat = position.lat();
    let posLon = position.lng();
    position = posLat + ',' + posLon;
    get_posts(posLat, posLon, radius); // Ask Flickr for posts
}

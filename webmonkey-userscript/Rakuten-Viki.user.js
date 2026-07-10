// ==UserScript==
// @name         Rakuten Viki
// @description  Watch videos in external player.
// @version      1.2.1
// @match        *://*.viki.com/videos/*
// @match        *://*.viki.com/tv/*
// @match        *://*.viki.com/movies/*
// @icon         https://www.viki.com/favicon.ico
// @run-at       document-end
// @grant        unsafeWindow
// @grant        GM_startIntent
// @homepage     https://github.com/warren-bank/crx-Rakuten-Viki/tree/webmonkey-userscript/es5
// @supportURL   https://github.com/warren-bank/crx-Rakuten-Viki/issues
// @downloadURL  https://github.com/warren-bank/crx-Rakuten-Viki/raw/webmonkey-userscript/es5/webmonkey-userscript/Rakuten-Viki.user.js
// @updateURL    https://github.com/warren-bank/crx-Rakuten-Viki/raw/webmonkey-userscript/es5/webmonkey-userscript/Rakuten-Viki.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// ----------------------------------------------------------------------------- constants

var user_options = {
  "common": {
    "rewrite_tv_pages":          true,
    "rewrite_tv_pages_delay_ms": 2500
  },
  "developer": {
    "debug": true
  },
  "webmonkey": {
    "post_intent_redirect_to_url":  "about:blank"
  },
  "greasemonkey": {
    "redirect_to_webcast_reloaded": true,
    "force_http":                   true,
    "force_https":                  false
  }
}

// ----------------------------------------------------------------------------- helpers (xhr)

var serialize_xhr_body_object = function(data) {
  if (typeof data === 'string')
    return data

  if (!(data instanceof Object))
    return null

  var body = []
  var keys = Object.keys(data)
  var key, val
  for (var i=0; i < keys.length; i++) {
    key = keys[i]
    val = data[key]
    val = encodeURIComponent(val)

    body.push(key + '=' + val)
  }
  body = body.join('&')
  return body
}

var download_text = function(url, headers, data, callback) {
  if (data) {
    if (!headers)
      headers = {}
    if (!headers['content-type'])
      headers['content-type'] = 'application/x-www-form-urlencoded'

    switch(headers['content-type'].toLowerCase()) {
      case 'application/json':
        data = JSON.stringify(data)
        break

      case 'application/x-www-form-urlencoded':
      default:
        data = serialize_xhr_body_object(data)
        break
    }
  }

  var xhr    = new unsafeWindow.XMLHttpRequest()
  var method = data ? 'POST' : 'GET'

  xhr.open(method, url, true, null, null)

  if (headers && (typeof headers === 'object')) {
    var keys = Object.keys(headers)
    var key, val
    for (var i=0; i < keys.length; i++) {
      key = keys[i]
      val = headers[key]
      xhr.setRequestHeader(key, val)
    }
  }

  xhr.onload = function(e) {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        callback(null, xhr.responseText)
      }
    }
  }

  xhr.onerror = function(error) {
    callback(error)
  }

  if (data)
    xhr.send(data)
  else
    xhr.send()
}

var download_json = function(url, headers, data, callback) {
  if (!headers)
    headers = {}
  if (!headers.accept)
    headers.accept = 'application/json'

  download_text(url, headers, data, function(error, text){
    if (error) {
      callback(error)
    }
    else {
      try {
        callback(null, JSON.parse(text))
      }
      catch(e) {
        callback(e)
      }
    }
  })
}

// ----------------------------------------------------------------------------- API

var download_tv_episodes = function(series_id, callback) {
  var api_url = 'https://api.viki.io/v4/containers/' + series_id + '/episodes.json?token=undefined&direction=asc&with_upcoming=true&sort=number&blocked=true&only_ids=true&app=100000a'

  download_json(api_url, null, null, function(error, api_data) {
    if (!error && api_data && (typeof api_data === 'object') && Array.isArray(api_data.response) && api_data.response.length)
      callback(api_data.response)
  })
}

// ----------------------------------------------------------------------------- URL links to tools on Webcast Reloaded website

var get_webcast_reloaded_url = function(video_url, caption_url, referer_url, drm_scheme, drm_server, force_http, force_https) {
  force_http  = (typeof force_http  === 'boolean') ? force_http  : user_options.greasemonkey.force_http
  force_https = (typeof force_https === 'boolean') ? force_https : user_options.greasemonkey.force_https

  var encoded_video_url, encoded_caption_url, encoded_referer_url, encoded_drm_url, webcast_reloaded_base, webcast_reloaded_url

  encoded_video_url     = encodeURIComponent(encodeURIComponent(btoa(video_url)))
  encoded_caption_url   = caption_url ? encodeURIComponent(encodeURIComponent(btoa(caption_url))) : null
  referer_url           = referer_url ? referer_url : unsafeWindow.location.href
  encoded_referer_url   = encodeURIComponent(encodeURIComponent(btoa(referer_url)))
  encoded_drm_url       = (drm_scheme && drm_server) ? encodeURIComponent(encodeURIComponent(btoa(drm_scheme + '|' + drm_server))) : null

  webcast_reloaded_base = {
    "https": "https://warren-bank.github.io/crx-webcast-reloaded/external_website/index.html",
    "http":  "http://webcast-reloaded.frii.site/index.html"
  }

  webcast_reloaded_base = (force_http)
                            ? webcast_reloaded_base.http
                            : (force_https)
                               ? webcast_reloaded_base.https
                               : (video_url.toLowerCase().indexOf('http:') === 0)
                                  ? webcast_reloaded_base.http
                                  : webcast_reloaded_base.https

  webcast_reloaded_url  = webcast_reloaded_base    + '#/watch/'    + encoded_video_url
                            + (encoded_caption_url ? ('/subtitle/' + encoded_caption_url) : '')
                            + (encoded_referer_url ? ('/referer/'  + encoded_referer_url) : '')
                            + (encoded_drm_url     ? ('/drm/'      + encoded_drm_url) : '')

  return webcast_reloaded_url
}

// ----------------------------------------------------------------------------- URL redirect

var determine_video_type = function(video_url) {
  if (!video_url) return null

  var video_url_regex_pattern = /^.*\.(mp4|mp4v|mpv|m1v|m4v|mpg|mpg2|mpeg|xvid|webm|3gp|avi|mov|mkv|ogv|ogm|m3u8|mpd|ism(?:[vc]|\/manifest)?)(?:[\?#].*)?$/i
  var matches, file_ext, video_type

  matches = video_url_regex_pattern.exec(video_url)

  if (matches && matches.length)
    file_ext = matches[1]

  if (file_ext) {
    switch (file_ext) {
      case "mp4":
      case "mp4v":
      case "m4v":
        video_type = "video/mp4"
        break
      case "mpv":
        video_type = "video/MPV"
        break
      case "m1v":
      case "mpg":
      case "mpg2":
      case "mpeg":
        video_type = "video/mpeg"
        break
      case "xvid":
        video_type = "video/x-xvid"
        break
      case "webm":
        video_type = "video/webm"
        break
      case "3gp":
        video_type = "video/3gpp"
        break
      case "avi":
        video_type = "video/x-msvideo"
        break
      case "mov":
        video_type = "video/quicktime"
        break
      case "mkv":
        video_type = "video/x-mkv"
        break
      case "ogg":
      case "ogv":
      case "ogm":
        video_type = "video/ogg"
        break
      case "m3u8":
        video_type = "application/x-mpegURL"
        break
      case "mpd":
        video_type = "application/dash+xml"
        break
      case "ism":
      case "ism/manifest":
      case "ismv":
      case "ismc":
        video_type = "application/vnd.ms-sstr+xml"
        break
    }
  }

  return video_type ? video_type.toLowerCase() : ""
}

var redirect_to_url = function(url) {
  if (!url) return

  try {
    unsafeWindow.top.location = url
  }
  catch(e) {
    unsafeWindow.window.location = url
  }
}

var process_webmonkey_post_intent_redirect_to_url = function() {
  var url = null

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'string')
    url = user_options.webmonkey.post_intent_redirect_to_url

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'function')
    url = user_options.webmonkey.post_intent_redirect_to_url()

  if (typeof url === 'string')
    redirect_to_url(url)
}

var process_video_data = function(data) {
  if (!data.video_url) return

  if (!data.referer_url)
    data.referer_url = unsafeWindow.location.href

  if (typeof GM_startIntent === 'function') {
    // running in Android-WebMonkey: open Intent chooser

    if (!data.video_type)
      data.video_type = determine_video_type(data.video_url)

    var args = [
      /* action = */ 'android.intent.action.VIEW',
      /* data   = */ data.video_url,
      /* type   = */ data.video_type
    ]

    // extras:
    if (data.caption_url) {
      args.push('textUrl')
      args.push(data.caption_url)
    }
    if (data.referer_url) {
      args.push('referUrl')
      args.push(data.referer_url)
    }
    if (data.drm.scheme) {
      args.push('drmScheme')
      args.push(data.drm.scheme)
    }
    if (data.drm.server) {
      args.push('drmUrl')
      args.push(data.drm.server)
    }
    if (data.drm.headers && (typeof data.drm.headers === 'object')) {
      var drm_header_keys, drm_header_key, drm_header_val

      drm_header_keys = Object.keys(data.drm.headers)
      for (var i=0; i < drm_header_keys.length; i++) {
        drm_header_key = drm_header_keys[i]
        drm_header_val = data.drm.headers[drm_header_key]

        args.push('drmHeader')
        args.push(drm_header_key + ': ' + drm_header_val)
      }
    }

    GM_startIntent.apply(this, args)
    process_webmonkey_post_intent_redirect_to_url()
    return true
  }
  else if (user_options.greasemonkey.redirect_to_webcast_reloaded) {
    // running in standard web browser: redirect URL to top-level tool on Webcast Reloaded website

    redirect_to_url(get_webcast_reloaded_url(data.video_url, data.caption_url, data.referer_url, data.drm.scheme, data.drm.server))
    return true
  }
  else {
    return false
  }
}

// -------------------------------------

var process_hls_data = function(data) {
  data.video_type = 'application/x-mpegurl'
  process_video_data(data)
}

var process_dash_data = function(data) {
  data.video_type = 'application/dash+xml'
  process_video_data(data)
}

// -------------------------------------

var process_video_url = function(video_url, video_type, caption_url, referer_url, drm_scheme, drm_server) {
  var data = {
    drm: {
      scheme:    drm_scheme || null,
      server:    drm_server || null,
      headers:   null
    },
    video_url:   video_url   || null,
    video_type:  video_type  || null,
    caption_url: caption_url || null,
    referer_url: referer_url || null
  }

  process_video_data(data)
}

var process_hls_url = function(video_url, caption_url, referer_url, drm_scheme, drm_server) {
  process_video_url(video_url, /* video_type= */ 'application/x-mpegurl', caption_url, referer_url, drm_scheme, drm_server)
}

var process_dash_url = function(video_url, caption_url, referer_url, drm_scheme, drm_server) {
  process_video_url(video_url, /* video_type= */ 'application/dash+xml', caption_url, referer_url, drm_scheme, drm_server)
}

// ----------------------------------------------------------------------------- process video page

var inspect_video_dom_scripts = function() {
  var script, regex, match, video, drmData

  script = unsafeWindow.document.querySelector('script#__NEXT_DATA__[type="application/json"]')
  if (!script) return null

  script = script.textContent

  regex = {
    video: /\{"type":"video","url":"([^"]+)"/,
    drm:   /"drm":"([^"]+)"/
  }

  match = regex.video.exec(script)
  if (!match) return null

  video = {
    drm: {
      scheme:    null,
      server:    null,
      headers:   null
    },
    video_url:   JSON.parse('"' + match[1] + '"'),
    video_type:  null,
    caption_url: null,
    referer_url: null
  }

  match = regex.drm.exec(script)
  if (match) {
    try {
      drmData = JSON.parse(atob(match[1]))

      if (drmData && (typeof drmData === 'object')) {
        if (drmData.dt3) {
          video.drm.scheme = 'widevine'
          video.drm.server = drmData.dt3
        }
        else if (drmData.dt2) {
          video.drm.scheme = 'playready'
          video.drm.server = drmData.dt2
        }
      }
    }
    catch(e) {}
  }

  return video
}

// ----------------------------------------------------------------------------- rewrite tv page

var rewrite_tv_page = function(pathname) {
  var series_regex = /^\/tv\/([^-]+)(?:-.*)?$/
  var match        = series_regex.exec(pathname)
  if (!match) return

  var series_id = match[1]

  download_tv_episodes(series_id, function(episode_ids) {
    unsafeWindow.document.close()
    unsafeWindow.document.open()
    unsafeWindow.document.write('<!DOCTYPE html><html><head></head><body></body></html>')
    unsafeWindow.document.close()

    var head = unsafeWindow.document.getElementsByTagName('head')[0]
    var body = unsafeWindow.document.body

    var html = {
      "head": [
        '<style>',
        'body > * {',
        '  display: none !important;',
        '}',
        'body > ul {',
        '  display: block !important;',
        '}',
        'body > ul > li {',
        '  line-height: 1.5em;',
        '}',
        'body > ul > li > a {',
        '  text-decoration: none;',
        '}',
        '</style>'
      ],
      "body": []
    }

    html.body.push('<ul>')
    for (var i=0; i < episode_ids.length; i++) {
      html.body.push('<li><a target="_blank" href="/videos/' + episode_ids[i] + '">episode ' + (i+1) + '</a></li>')
    }
    html.body.push('</ul>')

    head.innerHTML = '' + html.head.join("\n")
    body.innerHTML = '' + html.body.join("\n")
  })
}

// ----------------------------------------------------------------------------- bootstrap

var init = function() {
  var pathname = unsafeWindow.location.pathname
  var video

  if (pathname.indexOf('/videos/') === 0) {
    video = inspect_video_dom_scripts()

    if (video)
      process_video_data(video)
  }
  else if (pathname.indexOf('/tv/') === 0) {
    if (user_options.common.rewrite_tv_pages) {
      unsafeWindow.setTimeout(function() {
        rewrite_tv_page(pathname)
      }, (user_options.common.rewrite_tv_pages_delay_ms || 0))
    }
    else {
      unsafeWindow.document.addEventListener('click', function(event) {
        if (event.target.querySelector('i.icon-viki-play')) {
          var $a = event.target.closest('a[href^="/videos/"]')
          if (!$a) return

          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          unsafeWindow.location = $a.href
        }
      }, true)
    }
  }
  else if (pathname.indexOf('/movies/') === 0) {
    unsafeWindow.document.addEventListener('click', function(event) {
      if (event.target.matches('i.icon-play') || (event.target.matches('button') && event.target.querySelector(':scope > i.icon-play'))) {
        var script = unsafeWindow.document.querySelector('script#__NEXT_DATA__[type="application/json"]').textContent
        var url_regex = new RegExp('"web":"(https://www\\.viki\\.com/videos/[^"]+)"')
        var match = url_regex.exec(script)
        if (!match) return

        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        unsafeWindow.location = JSON.parse('"' + match[1] + '"')
      }
    }, true)
  }
}

if (user_options.developer.debug)
  debugger;

init()

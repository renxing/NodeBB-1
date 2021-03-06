"use strict";

var ajaxify = {};

(function ($) {
	/*global app, templates, utils*/

	var location = document.location || window.location,
		rootUrl = location.protocol + '//' + (location.hostname || location.host) + (location.port ? ':' + location.port : ''),
		content = null;

	var current_state = null;
	var executed = {};

	var events = [];
	ajaxify.register_events = function (new_page_events) {
		for (var i = 0, ii = events.length; i < ii; i++) {
			socket.removeAllListeners(events[i]); // optimize this to user removeListener(event, listener) instead.
		}

		events = new_page_events;
	};


	window.onpopstate = function (event) {
		if (event !== null && event.state && event.state.url !== undefined && !ajaxify.initialLoad) {
			ajaxify.go(event.state.url, null, true);
		}
	};

	ajaxify.currentPage = null;
	ajaxify.initialLoad = false;

	ajaxify.go = function (url, callback, quiet) {
		// "quiet": If set to true, will not call pushState
		app.enterRoom('global');

		$(window).off('scroll');

		$(window).trigger('action:ajaxify.start', { url: url });
		$('body').trigger('action:ajaxifying', {url: url});	// Deprecated as of v0.4.0

		if ($('#content').hasClass('ajaxifying')) {
			templates.cancelRequest();
		}

		// Remove trailing slash
		url = url.replace(/\/$/, "");

		if (url.indexOf(RELATIVE_PATH.slice(1)) !== -1) {
			url = url.slice(RELATIVE_PATH.length);
		}

		var tpl_url = templates.get_custom_map(url.split('?')[0]);

		if (tpl_url == false && !templates[url]) {
			if (url === '' || url === '/') {
				tpl_url = 'home';
			} else {
				tpl_url = url.split('/')[0].split('?')[0];
			}

		} else if (templates[url]) {
			tpl_url = url;
		}

		var hash = '';
		if(ajaxify.initialLoad) {
			hash = window.location.hash ? window.location.hash : '';
		}

		if (templates.is_available(tpl_url) && !templates.force_refresh(tpl_url)) {
			ajaxify.currentPage = tpl_url;

			if (window.history && window.history.pushState) {
				window.history[!quiet ? 'pushState' : 'replaceState']({
					url: url + hash
				}, url, RELATIVE_PATH + '/' + url + hash);

				$.ajax(RELATIVE_PATH + '/plugins/fireHook', {
					type: 'PUT',
					data: {
						_csrf: $('#csrf_token').val(),
						hook: 'page.load',
						args: {
							template: tpl_url,
							url: url,
							uid: app.uid
						}
					}
				});
			}

			translator.load(tpl_url);

			jQuery('#footer, #content').removeClass('hide').addClass('ajaxifying');

			templates.flush();
			templates.load_template(function () {
				exec_body_scripts(content);
				require(['forum/' + tpl_url], function(script) {
					if (script && script.init) {
						script.init();
					}
				});

				if (callback) {
					callback();
				}

				app.processPage();

				jQuery('#content, #footer').stop(true, true).removeClass('ajaxifying');
				ajaxify.initialLoad = false;

				app.refreshTitle(url);
				$(window).trigger('action:ajaxify.end', { url: url });
			}, url);

			return true;
		}

		return false;
	};

	ajaxify.refresh = function() {
		ajaxify.go(ajaxify.currentPage);
	};

	$('document').ready(function () {
		if (!window.history || !window.history.pushState) {
			return; // no ajaxification for old browsers
		}

		content = content || document.getElementById('content');

		// Enhancing all anchors to ajaxify...
		$(document.body).on('click', 'a', function (e) {
			function hrefEmpty(href) {
				return href === 'javascript:;' || href === window.location.href + "#" || href.slice(-1) === "#";
			}

			if (hrefEmpty(this.href) || this.target !== '' || this.protocol === 'javascript:') {
				return;
			}

			if(!window.location.pathname.match(/\/(403|404)$/g)) {
				app.previousUrl = window.location.href;
			}

			if (this.getAttribute('data-ajaxify') === 'false') {
				return;
			}

			if ((!e.ctrlKey && !e.shiftKey) && e.which === 1) {
				if (this.host === window.location.host) {
					// Internal link
					var url = this.href.replace(rootUrl + '/', '');

					if (ajaxify.go(url)) {
						e.preventDefault();
					}
				} else if (window.location.pathname !== '/outgoing') {
					// External Link

					if (config.useOutgoingLinksPage) {
						ajaxify.go('outgoing?url=' + encodeURIComponent(this.href));
						e.preventDefault();
					}
				}
			}
		});
	});

	function exec_body_scripts(body_el) {
		// modified from http://stackoverflow.com/questions/2592092/executing-script-elements-inserted-with-innerhtml

		function nodeName(elem, name) {
			return elem.nodeName && elem.nodeName.toUpperCase() === name.toUpperCase();
		}

		function evalScript(elem) {
			var data = (elem.text || elem.textContent || elem.innerHTML || ""),
				head = document.getElementsByTagName("head")[0] ||
					document.documentElement,
				script = document.createElement("script");

			script.type = "text/javascript";
			try {
				script.appendChild(document.createTextNode(data));
			} catch (e) {
				script.text = data;
			}

			if (elem.src) {
				script.src = elem.src;
			}

			head.insertBefore(script, head.firstChild);
			//TODO: remove from head before inserting?, doing this breaks scripts in safari so commented out for now
			//head.removeChild(script);
		}

		var scripts = [],
			script,
			children_nodes = $(body_el).find('script'),
			child,
			i;

		for (i = 0; children_nodes[i]; i++) {
			child = children_nodes[i];
			if (nodeName(child, "script") &&
				(!child.type || child.type.toLowerCase() === "text/javascript")) {
				scripts.push(child);
			}
		}

		for (i = 0; scripts[i]; i++) {
			script = scripts[i];
			if (script.parentNode) {
				script.parentNode.removeChild(script);
			}
			evalScript(scripts[i]);
		}
	}

}(jQuery));

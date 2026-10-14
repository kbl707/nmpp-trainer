// Inline-SVG sanitiser for `data.svg` (SPEC.md §5.3).
//
// Task content is written by the parent/Claude, but it is still injected into
// the page, so the markup is parsed as XML and rebuilt node by node — never
// assigned with innerHTML — after everything that could run code or fetch
// something has been removed.
//
//   NMPPSvg.build(markup, alt) -> an <svg> element ready to insert, or null
//
// null (nothing rendered) when: no/blank alt text, markup over 4 KB, not
// well-formed XML, or the root is not <svg>. Exposed on `window` so the same
// code can be exercised by a test page without the rest of the app.
(function (global) {
  "use strict";

  var MAX_BYTES = 4096;
  var SVG_NS = "http://www.w3.org/2000/svg";

  // Elements removed together with everything inside them.
  var DROP_ELEMENTS = {
    script: 1, foreignobject: 1, iframe: 1, object: 1, embed: 1, audio: 1, video: 1,
    // external CSS (@import / url()) and SMIL (can rewrite href/on* at runtime)
    style: 1, animate: 1, animatemotion: 1, animatetransform: 1, set: 1, handler: 1, listener: 1,
  };

  function byteLength(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
    return unescape(encodeURIComponent(s)).length;
  }

  // An attribute value may only reference things inside the document: url(#id).
  function hasExternalUrl(v) {
    return /url\(\s*(?!['"]?\s*#)/i.test(v);
  }

  function cleanElement(el) {
    var i, attr, name, value, lname;
    // iterate over a copy: we remove while looping
    var attrs = Array.prototype.slice.call(el.attributes);
    for (i = 0; i < attrs.length; i++) {
      attr = attrs[i];
      name = attr.name;
      lname = name.toLowerCase();
      value = attr.value;
      var local = lname.indexOf(":") > -1 ? lname.split(":").pop() : lname;
      if (/^on/.test(local)) {
        el.removeAttribute(name); // onclick, onload, onbegin, … (no SVG attribute starts with "on" otherwise)
      } else if (local === "href") {
        // href / xlink:href: only same-document fragments ("#…")
        if (value.replace(/^\s+/, "").charAt(0) !== "#") el.removeAttribute(name);
      } else if (/javascript:|data:text\/html|vbscript:/i.test(value) || hasExternalUrl(value)) {
        el.removeAttribute(name);
      } else if (local === "style" && /expression\s*\(|@import|behavior\s*:/i.test(value)) {
        el.removeAttribute(name);
      }
    }
  }

  function sanitizeTree(node) {
    var child = node.firstElementChild;
    while (child) {
      var next = child.nextElementSibling;
      var tag = (child.localName || "").toLowerCase();
      if (DROP_ELEMENTS[tag]) {
        node.removeChild(child);
      } else {
        cleanElement(child);
        sanitizeTree(child);
      }
      child = next;
    }
  }

  function build(markup, alt) {
    if (typeof markup !== "string" || markup.trim() === "") return null;
    if (typeof alt !== "string" || alt.trim() === "") return null; // alt text is required
    if (byteLength(markup) > MAX_BYTES) return null;

    var doc;
    try {
      doc = new DOMParser().parseFromString(markup, "image/svg+xml");
    } catch (e) {
      return null;
    }
    if (!doc || !doc.documentElement || doc.getElementsByTagName("parsererror").length) return null;
    var root = doc.documentElement;
    if ((root.localName || "").toLowerCase() !== "svg" || root.namespaceURI !== SVG_NS) return null;

    cleanElement(root);
    sanitizeTree(root);

    // Scale with the container: keep a viewBox, drop fixed pixel sizes.
    if (!root.getAttribute("viewBox")) {
      var w = parseFloat(root.getAttribute("width"));
      var h = parseFloat(root.getAttribute("height"));
      if (w > 0 && h > 0) root.setAttribute("viewBox", "0 0 " + w + " " + h);
    }
    root.removeAttribute("width");
    root.removeAttribute("height");
    root.removeAttribute("style");
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", alt.trim());
    root.setAttribute("focusable", "false");
    root.setAttribute("class", "item-svg");

    return document.importNode(root, true);
  }

  global.NMPPSvg = { build: build, MAX_BYTES: MAX_BYTES };
})(window);

import Color from "./../math/color.js";
import WebGLRenderer from "./../video/webgl/webgl_renderer.js";
import { renderer as globalRenderer, createCanvas } from "./../video/video.js";
import * as stringUtil from "./../utils/string.js";
import pool from "./../system/pooling.js";
import Renderable from "./../renderable/renderable.js";
import { nextPowerOfTwo } from "./../math/math.js";
import setContextStyle from "./textstyle.js";
import TextMetrics from "./textmetrics.js";


/*
* ASCII Table
* http://www.asciitable.com/
* [ !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz]
*
* -> first char " " 32d (0x20);
*/


var runits = ["ex", "em", "pt", "px"];
var toPX = [12, 24, 0.75, 1];

/**
 * @classdesc
 * a generic system font object.
 * @augments Renderable
 */
class Text extends Renderable {
    /**
     * @param {number} x position of the text object
     * @param {number} y position of the text object
     * @param {object} settings the text configuration
     * @param {string} settings.font a CSS family font name
     * @param {number|string} settings.size size, or size + suffix (px, em, pt)
     * @param {Color|string} [settings.fillStyle="#000000"] a CSS color value
     * @param {Color|string} [settings.strokeStyle="#000000"] a CSS color value
     * @param {number} [settings.lineWidth=1] line width, in pixels, when drawing stroke
     * @param {string} [settings.textAlign="left"] horizontal text alignment
     * @param {string} [settings.textBaseline="top"] the text baseline
     * @param {number} [settings.lineHeight=1.0] line spacing height
     * @param {Vector2d} [settings.anchorPoint={x:0.0, y:0.0}] anchor point to draw the text at
     * @param {boolean} [settings.offScreenCanvas=false] whether to draw the font to an individual "cache" texture first
     * @param {number} [settings.wordWrapWidth] the maximum length in CSS pixel for a single segment of text
     * @param {(string|string[])} [settings.text=""] a string, or an array of strings
     * @example
     * var font = new me.Text(0, 0, {font: "Arial", size: 8, fillStyle: this.color});
     */
    constructor(x, y, settings) {
        // call the parent constructor
        super(x, y, settings.width || 0, settings.height || 0);
        this.onResetEvent(x, y, settings);
    }

    /** @ignore */
    onResetEvent(x, y, settings) {

        /**
         * defines the color used to draw the font.<br>
         * @public
         * @type {Color}
         * @default black
         */
        if (typeof settings.fillStyle !== "undefined") {
            if (settings.fillStyle instanceof Color) {
                this.fillStyle = settings.fillStyle;
            } else {
                // string (#RGB, #ARGB, #RRGGBB, #AARRGGBB)
                this.fillStyle = pool.pull("Color").parseCSS(settings.fillStyle);
            }
        } else {
            this.fillStyle = pool.pull("Color", 0, 0, 0);
        }

        /**
         * defines the color used to draw the font stroke.<br>
         * @public
         * @type {Color}
         * @default black
         */
         if (typeof settings.strokeStyle !== "undefined") {
             if (settings.strokeStyle instanceof Color) {
                 this.strokeStyle = settings.strokeStyle;
             } else {
                 // string (#RGB, #ARGB, #RRGGBB, #AARRGGBB)
                 this.strokeStyle = pool.pull("Color").parseCSS(settings.strokeStyle);
             }
         } else {
             this.strokeStyle = pool.pull("Color", 0, 0, 0);
         }

        /**
         * sets the current line width, in pixels, when drawing stroke
         * @public
         * @type {number}
         * @default 1
         */
        this.lineWidth = settings.lineWidth || 1;

        /**
         * Set the default text alignment (or justification),<br>
         * possible values are "left", "right", and "center".<br>
         * @public
         * @type {string}
         * @default "left"
         */
        this.textAlign = settings.textAlign || "left";

        /**
         * Set the text baseline (e.g. the Y-coordinate for the draw operation), <br>
         * possible values are "top", "hanging, "middle, "alphabetic, "ideographic, "bottom"<br>
         * @public
         * @type {string}
         * @default "top"
         */
        this.textBaseline = settings.textBaseline || "top";

        /**
         * Set the line spacing height (when displaying multi-line strings). <br>
         * Current font height will be multiplied with this value to set the line height.
         * @public
         * @type {number}
         * @default 1.0
         */
        this.lineHeight = settings.lineHeight || 1.0;

        /**
         * whether to draw the font to a indidividual offscreen canvas texture first <br>
         * Note: this will improve performances when using WebGL, but will impact
         * memory consumption as every text element will have its own canvas texture
         * @public
         * @type {boolean}
         * @default false
         */
        this.offScreenCanvas = false;

        /**
         * the maximum length in CSS pixel for a single segment of text.
         * (use -1 to disable word wrapping)
         * @public
         * @type {number}
         * @default -1
         */
        this.wordWrapWidth = settings.wordWrapWidth || -1;

        /**
         * the text to be displayed
         * @private
         */
        this._text = [];

        /**
         * the font size (in px)
         * @public
         * @type {number}
         * @default 10
         */
        this.fontSize = 10;

        // anchor point
        if (typeof settings.anchorPoint !== "undefined") {
            this.anchorPoint.setV(settings.anchorPoint);
        } else {
            this.anchorPoint.set(0, 0);
        }

        // if floating was specified through settings
        if (typeof settings.floating !== "undefined") {
            this.floating = !!settings.floating;
        }

        // font name and type
        this.setFont(settings.font, settings.size);

        // aditional
        if (settings.bold === true) {
            this.bold();
        }
        if (settings.italic === true) {
            this.italic();
        }

        if (settings.offScreenCanvas === true) {
            this.offScreenCanvas = true;
            this.canvas = createCanvas(2, 2, true);
            this.context = this.canvas.getContext("2d");
        }

        // instance to text metrics functions
        this.metrics = new TextMetrics(this);

        // set the text
        this.setText(settings.text);

        // force update bounds on object creation
        this.update(0);
    }

    /** @ignore */
    onDeactivateEvent() {
        // free the canvas and potential corresponding texture when deactivated
        if (this.offScreenCanvas === true) {
            globalRenderer.currentCompositor.deleteTexture2D(globalRenderer.currentCompositor.getTexture2D(this.glTextureUnit));
            globalRenderer.cache.delete(this.canvas);
            this.canvas.width = this.canvas.height = 0;
            this.context = undefined;
            this.canvas = undefined;
            this.glTextureUnit = undefined;
        }
    }

    /**
     * make the font bold
     * @returns {Text} this object for chaining
     */
    bold() {
        this.font = "bold " + this.font;
        this.isDirty = true;
        return this;
    }

    /**
     * make the font italic
     * @returns {Text} this object for chaining
     */
    italic() {
        this.font = "italic " + this.font;
        this.isDirty = true;
        return this;
    }

    /**
     * set the font family and size
     * @param {string} font a CSS font name
     * @param {number|string} [size=10] size in px, or size + suffix (px, em, pt)
     * @returns {Text} this object for chaining
     * @example
     * font.setFont("Arial", 20);
     * font.setFont("Arial", "1.5em");
     */
    setFont(font, size) {
        // font name and type
        var font_names = font.split(",").map(function (value) {
            value = value.trim();
            return (
                !/(^".*"$)|(^'.*'$)/.test(value)
            ) ? "\"" + value + "\"" : value;
        });

        // font size
        if (typeof size === "number") {
            this.fontSize = size;
            size += "px";
        } else /* string */ {
            // extract the units and convert if necessary
            var CSSval = size.match(/([-+]?[\d.]*)(.*)/);
            this.fontSize = parseFloat(CSSval[1]);
            if (CSSval[2]) {
                this.fontSize *= toPX[runits.indexOf(CSSval[2])];
            } else {
                // no unit define, assume px
                size += "px";
            }
        }
        this.height = this.fontSize;
        this.font = size + " " + font_names.join(",");

        this.isDirty = true;

        return this;
    }

    /**
     * change the text to be displayed
     * @param {number|string|string[]} value a string, or an array of strings
     * @returns {Text} this object for chaining
     */
    setText(value = "") {
        if (value.length > 0 && this.wordWrapWidth > -1) {
            value = this.metrics.wordWrap(value.toString(), this.wordWrapWidth, globalRenderer.getFontContext());
        }
        if (this._text.toString() !== value.toString()) {
            if (!Array.isArray(value)) {
                this._text = ("" + value).split("\n");
            } else {
                this._text = value;
            }
            this.isDirty = true;
        }

        return this;
    }

    /**
     * measure the given text size in pixels
     * @param {CanvasRenderer|WebGLRenderer} [renderer] reference to the active renderer
     * @param {string} [text] the text to be measured
     * @returns {TextMetrics} a TextMetrics object defining the dimensions of the given piece of text
     */
    measureText(renderer = globalRenderer, text = this._text) {
        var context;

        if (this.offScreenCanvas === true) {
            context = this.context;
        } else {
            context = renderer.getFontContext();
        }

        return this.metrics.measureText(text, context);
    }

    /**
     * @ignore
     */
    update(/* dt */) {
        if (this.isDirty === true) {
            var bounds = this.getBounds();
            bounds.addBounds(this.measureText(globalRenderer, this._text), true);
            if (this.offScreenCanvas === true) {
                var width = Math.round(bounds.width),
                    height = Math.round(bounds.height);

                if (globalRenderer instanceof WebGLRenderer) {
                    // invalidate the previous corresponding texture so that it can reuploaded once changed
                    this.glTextureUnit = globalRenderer.cache.getUnit(globalRenderer.cache.get(this.canvas));
                    globalRenderer.currentCompositor.unbindTexture2D(null, this.glTextureUnit);

                    if (globalRenderer.WebGLVersion === 1) {
                        // round size to next Pow2
                        width = nextPowerOfTwo(bounds.width);
                        height = nextPowerOfTwo(bounds.height);
                    }
                }

                // resize the cache canvas if necessary
                if (this.canvas.width < width || this.canvas.height < height) {
                    this.canvas.width = width;
                    this.canvas.height = height;
                    // resizing the canvas will automatically clear its content
                } else {
                    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
                }
                this._drawFont(this.context, this._text,  this.pos.x - bounds.x, this.pos.y - bounds.y, false);

            }
        }
        return this.isDirty;
    }

    /**
     * draw a text at the specified coord
     * @param {CanvasRenderer|WebGLRenderer} renderer Reference to the destination renderer instance
     * @param {string} [text]
     * @param {number} [x]
     * @param {number} [y]
     * @param {boolean} [stroke=false] draw stroke the the text if true
     */
    draw(renderer, text, x, y, stroke) {
        // "hacky patch" for backward compatibilty
        if (typeof this.ancestor === "undefined") {
            // update text cache
            this.setText(text);

            // update position if changed
            if (this.pos.x !== x || this.pos.y !== y) {
                this.pos.x = x;
                this.pos.y = y;
                this.isDirty = true;
            }

            // force update bounds
            this.update(0);

            // save the previous context
            renderer.save();

            // apply the defined alpha value
            renderer.setGlobalAlpha(renderer.globalAlpha() * this.getOpacity());

        } else {
            // added directly to an object container
            x = this.pos.x;
            y = this.pos.y;
        }

        if (renderer.settings.subPixel === false) {
            // clamp to pixel grid if required
            x = ~~x;
            y = ~~y;
        }

        // draw the text
        if (this.offScreenCanvas === true) {
            renderer.drawImage(this.canvas, this.getBounds().x, this.getBounds().y);
        } else {
            renderer.drawFont(this._drawFont(renderer.getFontContext(), this._text, x, y, stroke));
        }


        // for backward compatibilty
        if (typeof this.ancestor === "undefined") {
            // restore previous context
            renderer.restore();
        }

        // clear the dirty flag here for
        // backward compatibility
        this.isDirty = false;
    }

    /**
     * draw a stroke text at the specified coord, as defined <br>
     * by the `lineWidth` and `fillStroke` properties. <br>
     * Note : using drawStroke is not recommended for performance reasons
     * @param {CanvasRenderer|WebGLRenderer} renderer Reference to the destination renderer instance
     * @param {string} text
     * @param {number} x
     * @param {number} y
     */
    drawStroke(renderer, text, x, y) {
        this.draw(renderer, text, x, y, true);
    }

    /**
     * @ignore
     */
    _drawFont(context, text, x, y, stroke = false) {
        setContextStyle(context, this, stroke);

        for (var i = 0; i < text.length; i++) {
            var string = stringUtil.trimRight(""+text[i]);
            // draw the string
            context[stroke ? "strokeText" : "fillText"](string, x, y);
            // add leading space
            y += this.metrics.lineHeight();
        }
        return this.getBounds();
    }

    /**
     * Destroy function
     * @ignore
     */
    destroy() {
        pool.push(this.fillStyle);
        pool.push(this.strokeStyle);
        this.fillStyle = this.strokeStyle = undefined;
        this.metrics = undefined;
        this._text.length = 0;
        super.destroy();
    }
};

export default Text;

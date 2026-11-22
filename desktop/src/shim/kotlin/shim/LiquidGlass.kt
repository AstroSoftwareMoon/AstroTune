// Liquid Glass on the computer, as the phone draws it (app/.../ui/components/Glass.kt):
// what's behind, a little frosted and more vivid, bent by a lens toward the edges with
// the light split into a colour fringe there, under a thin film, a sheen across the top,
// light gathering at the foot and a bright rim. The phone records the page with the
// backdrop library; here the page is recorded into a graphics layer the glass samples,
// and the lens is a Skia runtime shader. See Downloads.kt for why this file sits here.
package com.opentune.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.RenderEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.unit.dp
import org.jetbrains.skia.FilterTileMode
import org.jetbrains.skia.ImageFilter
import org.jetbrains.skia.RuntimeEffect
import org.jetbrains.skia.RuntimeShaderBuilder

/** The page, recorded each frame for the glass floating over it to bend. */
class LiquidBackdrop internal constructor(internal val layer: GraphicsLayer) {
    @Volatile internal var origin: Offset = Offset.Zero
}

/** The window's recorded page; null where there's nothing under the glass to bend. */
val LocalLiquidBackdrop = staticCompositionLocalOf<LiquidBackdrop?> { null }

@Composable
fun rememberLiquidBackdrop(): LiquidBackdrop {
    val layer = rememberGraphicsLayer()
    return remember(layer) { LiquidBackdrop(layer) }
}

/** Records what this draws for the glass over it, and draws it as usual. */
fun Modifier.liquidSource(backdrop: LiquidBackdrop): Modifier =
    onGloballyPositioned { backdrop.origin = it.positionInWindow() }
        .drawWithContent {
            backdrop.layer.record { this@drawWithContent.drawContent() }
            drawLayer(backdrop.layer)
        }

/**
 * The lens: inside the shape nothing moves; over the last [depth] pixels before the edge
 * what's behind is pulled in from further out, more the nearer the edge, as through the
 * rounded rim of a thick piece of glass, with red and blue bent a little differently.
 */
private const val LENS = """
uniform shader content;
uniform float2 size;
uniform float radius;
uniform float depth;
uniform float strength;
uniform float fringe;

float edge(float2 p) {
    float2 h = size * 0.5;
    float2 q = abs(p - h) - (h - float2(radius));
    return length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

half4 main(float2 p) {
    float d = edge(p);
    float t = clamp(1.0 + d / depth, 0.0, 1.0);
    float bend = t * t * t;
    float2 n = float2(edge(p + float2(1.0, 0.0)) - edge(p - float2(1.0, 0.0)), edge(p + float2(0.0, 1.0)) - edge(p - float2(0.0, 1.0)));
    float len = length(n);
    n = len > 0.0001 ? n / len : float2(0.0);
    float2 off = -n * bend * strength;
    half4 c = content.eval(p + off);
    half r = content.eval(p + off * (1.0 + fringe)).r;
    half b = content.eval(p + off * (1.0 - fringe)).b;
    return half4(r, c.g, b, c.a);
}
"""

private val lensEffect: RuntimeEffect by lazy { RuntimeEffect.makeForShader(LENS) }

/** Saturation by [s], as Apple's vibrancy lifts the colours behind its glass. */
private fun saturate(s: Float): org.jetbrains.skia.ColorMatrix {
    val r = 0.213f; val g = 0.715f; val b = 0.072f
    return org.jetbrains.skia.ColorMatrix(
        r + (1 - r) * s, g - g * s, b - b * s, 0f, 0f,
        r - r * s, g + (1 - g) * s, b - b * s, 0f, 0f,
        r - r * s, g - g * s, b + (1 - b) * s, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )
}

private fun lens(size: Size, radius: Float, depth: Float, blur: Float, fringe: Boolean): RenderEffect {
    val builder = RuntimeShaderBuilder(lensEffect)
    builder.uniform("size", size.width, size.height)
    builder.uniform("radius", radius)
    builder.uniform("depth", depth.coerceAtLeast(1f))
    builder.uniform("strength", depth * 0.85f)
    builder.uniform("fringe", if (fringe) 0.14f else 0f)
    val frosted = ImageFilter.makeBlur(blur / 2f, blur / 2f, FilterTileMode.CLAMP, null, null)
    val vivid = ImageFilter.makeColorFilter(org.jetbrains.skia.ColorFilter.makeMatrix(saturate(1.6f)), frosted, null)
    return ImageFilter.makeRuntimeShader(builder, "content", vivid).asComposeRenderEffect()
}

/**
 * Liquid Glass over [backdrop]: the page under this shape, frosted, made vivid and
 * bent at the edges, under [film], with a sheen, a glow along the foot and a lit rim.
 */
@Composable
internal fun Modifier.liquidGlass(backdrop: LiquidBackdrop, shape: Shape, film: Color, dark: Boolean): Modifier {
    val layer = rememberGraphicsLayer()
    val at = remember { arrayOf(Offset.Zero) }
    return this
        .onGloballyPositioned { at[0] = it.positionInWindow() }
        .drawWithContent {
            val outline = shape.createOutline(size, layoutDirection, this)
            val radius = when (outline) {
                is Outline.Rounded -> outline.roundRect.topLeftCornerRadius.x
                is Outline.Rectangle -> 0f
                else -> size.minDimension / 2f
            }.coerceAtMost(size.minDimension / 2f)
            val depth = minOf(26.dp.toPx(), size.minDimension * 0.42f)
            layer.renderEffect = lens(size, radius, depth, blur = 14.dp.toPx(), fringe = true)
            val shift = at[0] - backdrop.origin
            layer.record { translate(-shift.x, -shift.y) { drawLayer(backdrop.layer) } }
            val clip = Path().apply { addOutline(outline) }
            clipPath(clip) {
                drawLayer(layer)
                drawRect(film)
                // Light falling across the top of the glass, fading out by its middle.
                drawRect(Brush.verticalGradient(0f to Color.White.copy(alpha = if (dark) 0.10f else 0.18f), 0.5f to Color.Transparent))
                // And light gathering at the lower edge, where a thick piece of glass catches it.
                drawRect(Brush.verticalGradient(0.72f to Color.Transparent, 1f to Color.White.copy(alpha = if (dark) 0.07f else 0.12f)))
            }
            drawContent()
            // A lit rim, brightest where light would catch it (top left and bottom right).
            drawOutline(
                outline,
                Brush.linearGradient(
                    0f to Color.White.copy(alpha = if (dark) 0.6f else 0.85f),
                    0.45f to Color.White.copy(alpha = if (dark) 0.14f else 0.3f),
                    1f to Color.White.copy(alpha = if (dark) 0.44f else 0.65f),
                    start = Offset.Zero, end = Offset(size.width, size.height),
                ),
                style = Stroke(1.1.dp.toPx()),
            )
        }
}

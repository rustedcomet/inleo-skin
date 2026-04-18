# Design System Document: Neon-Minimalist HUD

## 1. Overview & Creative North Star

### Creative North Star: "The Ethereal Terminal"
This design system rejects the clunky, weathered "grunge" of traditional cyberpunk in favor of a high-fidelity, sophisticated hacker aesthetic. It is a digital skin that feels like a redacted government terminal viewed through a high-end lens. We achieve this by blending the aggressive neon energy of a midnight metropolis with the clinical precision of a tactical HUD.

The system breaks the "template" look through **Intentional Asymmetry**. We move away from centered, balanced grids toward edge-weighted layouts, where technical data visualizations and thin hairline accents bleed off the canvas, suggesting a larger, complex machine humming just out of sight.

---

## 2. Colors & Surface Logic

The palette is rooted in the deep shadows of the `surface` (#0d1321), punctuated by the high-frequency radiation of neon purples and cyan.

### The "No-Line" Rule
Traditional 1px solid borders for sectioning are strictly prohibited. They are visually "expensive" and create a boxed-in feeling. Boundaries must be defined through:
- **Tonal Shifts:** Transitioning from `surface` to `surface-container-low` to define a sidebar or header.
- **Data Accents:** Using a `primary` (#ecb2ff) vertical hairline that only spans 20% of the section height to "imply" a boundary.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, semi-transparent glass planes.
*   **Base:** `surface` (#0d1321) – The void.
*   **Mid-Level:** `surface-container-low` (#151c29) – Secondary content areas.
*   **Interactive Top-Layer:** `surface-container-highest` (#2e3543) – Modals and active states.

### The "Glass & Gradient" Rule
To achieve "The Ethereal Terminal" look, use **Glassmorphism** for floating elements. 
*   **Formula:** `surface-container` at 60% opacity + `backdrop-filter: blur(12px)`.
*   **Signature Textures:** Incorporate subtle linear gradients transitioning from `primary` (#ecb2ff) to `primary_container` (#bd00ff) at a 45-degree angle for hero typography and high-priority action buttons.

---

## 3. Typography

The typography strategy pairs a technical, high-performance display face with a clean, readable sans-serif to bridge the gap between "machine" and "human."

*   **Display & Headlines (Space Grotesk):** This is the voice of the system. It is utilitarian yet futuristic. Use `display-lg` (3.5rem) with tighter letter-spacing for a dramatic, cinematic impact.
*   **Body (Inter):** High-readability sans-serif. Used for long-form data and content. The contrast between the eccentric Space Grotesk and the neutral Inter creates the "sophisticated hacker" tension.
*   **Labels (Space Grotesk):** Used for technical metadata. All labels must be uppercase with a letter-spacing of `0.05rem` to mimic HUD readouts.

---

## 4. Elevation & Depth

We eschew traditional drop shadows for **Tonal Layering** and **Luminescent Depth**.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` section to create a soft, natural depth.
*   **Ambient Shadows:** If a floating effect is required (e.g., a critical alert), use a shadow tinted with `surface_tint` (#ecb2ff) at 5% opacity. Blur values should be high (30px+) to create a "glow" rather than a shadow.
*   **The "Ghost Border" Fallback:** For containment, use the `outline-variant` token at 20% opacity. This creates a "hairline" effect that feels like a laser-etched guide rather than a structural wall.
*   **Neon Borders:** For active states, use a 1px border using the `primary` (#ecb2ff) token, but apply a `box-shadow: 0 0 8px` of the same color to simulate light emission.

---

## 5. Components

### Buttons
*   **Primary:** No bulky fills. Use a `surface` background with a `primary` ghost border. On hover, the border glows and the text shifts to `on_primary_container`.
*   **Secondary:** Subtle and smooth. Use `secondary` (#d3fbff) for text with no border. Interaction is signaled by a slight increase in background opacity.

### Input Fields
*   **Architecture:** Bottom-border only. Avoid 4-sided boxes.
*   **States:** When focused, the bottom border should glow with `primary` and a small "Scanning..." label in `label-sm` should appear in the corner.

### Cards
*   **Constraint:** Forbid divider lines.
*   **Structure:** Use vertical white space and subtle shifts between `surface-container-low` and `surface-container-high`.
*   **Accents:** Add a "corner bracket" (L-shape) in the top-right and bottom-left using `outline` at 30% opacity to reinforce the HUD aesthetic.

### Data HUDs (Unique Component)
*   Small, repeating blocks of binary or hex code using `label-sm` in `secondary_fixed_dim` (#00dbe9) at 40% opacity, used as a background texture for headers.

---

## 6. Do’s and Don'ts

### Do:
*   **Use Intentional Asymmetry:** Align text to the left but place technical metadata or "scanned" timestamps on the far right.
*   **Lean into Transparency:** Let the deep blues of the background bleed through your containers.
*   **Embrace the "Monospace" feel:** Even when using Inter, use `tabular-nums` for any numerical data.

### Don’t:
*   **No Rounded Corners:** Every `borderRadius` is `0px`. The future is sharp, precise, and uncompromising.
*   **No Generic Grays:** Every "neutral" must be tinted with the deep blue of the `surface`. Avoid `#333333` at all costs.
*   **No Heavy Borders:** If it looks like a "box," you’ve failed. It should look like a "projection."
*   **Don't Over-Glow:** If everything glows, nothing is important. Reserve the neon `primary` glow for active interactions and critical alerts only.
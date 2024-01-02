// Compute what scrolling needs to be done on required scrolling boxes for target to be in view

// The type names here are named after the spec to make it easier to find more information around what they mean:
// To reduce churn and reduce things that need be maintained things from the official TS DOM library is used here
// https://drafts.csswg.org/cssom-view/

// For a definition on what is "block flow direction" exactly, check this: https://drafts.csswg.org/css-writing-modes-4/#block-flow-direction

/**
 * This new option is tracked in this PR, which is the most likely candidate at the time: https://github.com/w3c/csswg-drafts/pull/1805
 * @public
 */
export type ScrollMode = 'always' | 'if-needed'

/** @public */
export interface Options {
  /**
   * Control the logical scroll position on the y-axis. The spec states that the `block` direction is related to the [writing-mode](https://developer.mozilla.org/en-US/docs/Web/CSS/writing-mode), but this is not implemented yet in this library.
   * This means that `block: 'start'` aligns to the top edge and `block: 'end'` to the bottom.
   * @defaultValue 'center'
   */
  block?: ScrollLogicalPosition
  /**
   * Like `block` this is affected by the [writing-mode](https://developer.mozilla.org/en-US/docs/Web/CSS/writing-mode). In left-to-right pages `inline: 'start'` will align to the left edge. In right-to-left it should be flipped. This will be supported in a future release.
   * @defaultValue 'nearest'
   */
  inline?: ScrollLogicalPosition
  /**
   * This is a proposed addition to the spec that you can track here: https://github.com/w3c/csswg-drafts/pull/5677
   *
   * This library will be updated to reflect any changes to the spec and will provide a migration path.
   * To be backwards compatible with `Element.scrollIntoViewIfNeeded` if something is not 100% visible it will count as "needs scrolling". If you need a different visibility ratio your best option would be to implement an [Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).
   * @defaultValue 'always'
   */
  scrollMode?: ScrollMode
  /**
   * By default there is no boundary. All the parent elements of your target is checked until it reaches the viewport ([`document.scrollingElement`](https://developer.mozilla.org/en-US/docs/Web/API/document/scrollingElement)) when calculating layout and what to scroll.
   * By passing a boundary you can short-circuit this loop depending on your needs:
   * 
   * - Prevent the browser window from scrolling.
   * - Scroll elements into view in a list, without scrolling container elements.
   * 
   * You can also pass a function to do more dynamic checks to override the scroll scoping:
   * 
   * ```js
   * let actions = compute(target, {
   *   boundary: (parent) => {
   *     // By default `overflow: hidden` elements are allowed, only `overflow: visible | clip` is skipped as
   *     // this is required by the CSSOM spec
   *     if (getComputedStyle(parent)['overflow'] === 'hidden') {
   *       return false
   *     }

   *     return true
   *   },
   * })
   * ```
   * @defaultValue null
   */
  boundary?: Element | ((parent: Element) => boolean) | null
  /**
   * New option that skips auto-scrolling all nodes with overflow: hidden set
   * See FF implementation: https://hg.mozilla.org/integration/fx-team/rev/c48c3ec05012#l7.18
   * @defaultValue false
   * @public
   */
  skipOverflowHiddenElements?: boolean
  behavior?: ScrollBehavior
}

/** @public */
export interface ScrollAction {
  el?: Element
  top: number
  left: number
}

// @TODO better shadowdom test, 11 = document fragment

/** @public */
export const compute = (target: Element, options: Options, webScroll: { force: boolean } = { force: false }): ScrollAction => {
  const isElement = (el: any): el is Element => typeof el === 'object' && el != null && el.nodeType === 1

  const canOverflow = (overflow: string | null, skipOverflowHiddenElements?: boolean) => {
    if (skipOverflowHiddenElements && overflow === 'hidden') {
      return false
    }

    return overflow !== 'visible' && overflow !== 'clip'
  }

  const getFrameElement = (el: Element) => {
    if (!el.ownerDocument || !el.ownerDocument.defaultView) {
      return null
    }

    try {
      return el.ownerDocument.defaultView.frameElement
    } catch (e) {
      return null
    }
  }

  const isHiddenByFrame = (el: Element): boolean => {
    const frame = getFrameElement(el)
    if (!frame) {
      return false
    }

    return frame.clientHeight < el.scrollHeight || frame.clientWidth < el.scrollWidth
  }

  const isScrollable = (el: Element, skipOverflowHiddenElements?: boolean) => {
    if (el.clientHeight < el.scrollHeight || el.clientWidth < el.scrollWidth) {
      const style = getComputedStyle(el, null)
      return canOverflow(style.overflowY, skipOverflowHiddenElements) || canOverflow(style.overflowX, skipOverflowHiddenElements) || isHiddenByFrame(el)
    }

    return false
  }
  /**
   * Find out which edge to align against when logical scroll position is "nearest"
   * Interesting fact: "nearest" works similarily to "if-needed", if the element is fully visible it will not scroll it
   *
   * Legends:
   * ┌────────┐ ┏ ━ ━ ━ ┓
   * │ target │   frame
   * └────────┘ ┗ ━ ━ ━ ┛
   */
  const alignNearest = (
    scrollingEdgeStart: number,
    scrollingEdgeEnd: number,
    scrollingSize: number,
    scrollingBorderStart: number,
    scrollingBorderEnd: number,
    elementEdgeStart: number,
    elementEdgeEnd: number,
    elementSize: number
  ) => {
    /**
     * If element edge A and element edge B are both outside scrolling box edge A and scrolling box edge B
     *
     *          ┌──┐
     *        ┏━│━━│━┓
     *          │  │
     *        ┃ │  │ ┃        do nothing
     *          │  │
     *        ┗━│━━│━┛
     *          └──┘
     *
     *  If element edge C and element edge D are both outside scrolling box edge C and scrolling box edge D
     *
     *    ┏ ━ ━ ━ ━ ┓
     *   ┌───────────┐
     *   │┃         ┃│        do nothing
     *   └───────────┘
     *    ┗ ━ ━ ━ ━ ┛
     */
    if ((elementEdgeStart < scrollingEdgeStart && elementEdgeEnd > scrollingEdgeEnd) || (elementEdgeStart > scrollingEdgeStart && elementEdgeEnd < scrollingEdgeEnd)) {
      return 0
    }

    /**
     * If element edge A is outside scrolling box edge A and element height is less than scrolling box height
     *
     *          ┌──┐
     *        ┏━│━━│━┓         ┏━┌━━┐━┓
     *          └──┘             │  │
     *  from  ┃      ┃     to  ┃ └──┘ ┃
     *
     *        ┗━ ━━ ━┛         ┗━ ━━ ━┛
     *
     * If element edge B is outside scrolling box edge B and element height is greater than scrolling box height
     *
     *        ┏━ ━━ ━┓         ┏━┌━━┐━┓
     *                           │  │
     *  from  ┃ ┌──┐ ┃     to  ┃ │  │ ┃
     *          │  │             │  │
     *        ┗━│━━│━┛         ┗━│━━│━┛
     *          │  │             └──┘
     *          │  │
     *          └──┘
     *
     * If element edge C is outside scrolling box edge C and element width is less than scrolling box width
     *
     *       from                 to
     *    ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
     *  ┌───┐                 ┌───┐
     *  │ ┃ │       ┃         ┃   │     ┃
     *  └───┘                 └───┘
     *    ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
     *
     * If element edge D is outside scrolling box edge D and element width is greater than scrolling box width
     *
     *       from                 to
     *    ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
     *        ┌───────────┐   ┌───────────┐
     *    ┃   │     ┃     │   ┃         ┃ │
     *        └───────────┘   └───────────┘
     *    ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
     */
    if ((elementEdgeStart <= scrollingEdgeStart && elementSize <= scrollingSize) || (elementEdgeEnd >= scrollingEdgeEnd && elementSize >= scrollingSize)) {
      return elementEdgeStart - scrollingEdgeStart - scrollingBorderStart
    }

    /**
     * If element edge B is outside scrolling box edge B and element height is less than scrolling box height
     *
     *        ┏━ ━━ ━┓         ┏━ ━━ ━┓
     *
     *  from  ┃      ┃     to  ┃ ┌──┐ ┃
     *          ┌──┐             │  │
     *        ┗━│━━│━┛         ┗━└━━┘━┛
     *          └──┘
     *
     * If element edge A is outside scrolling box edge A and element height is greater than scrolling box height
     *
     *          ┌──┐
     *          │  │
     *          │  │             ┌──┐
     *        ┏━│━━│━┓         ┏━│━━│━┓
     *          │  │             │  │
     *  from  ┃ └──┘ ┃     to  ┃ │  │ ┃
     *                           │  │
     *        ┗━ ━━ ━┛         ┗━└━━┘━┛
     *
     * If element edge C is outside scrolling box edge C and element width is greater than scrolling box width
     *
     *           from                 to
     *        ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
     *  ┌───────────┐           ┌───────────┐
     *  │     ┃     │   ┃       │ ┃         ┃
     *  └───────────┘           └───────────┘
     *        ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
     *
     * If element edge D is outside scrolling box edge D and element width is less than scrolling box width
     *
     *           from                 to
     *        ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
     *                ┌───┐             ┌───┐
     *        ┃       │ ┃ │       ┃     │   ┃
     *                └───┘             └───┘
     *        ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
     *
     */
    if ((elementEdgeEnd > scrollingEdgeEnd && elementSize < scrollingSize) || (elementEdgeStart < scrollingEdgeStart && elementSize > scrollingSize)) {
      return elementEdgeEnd - scrollingEdgeEnd + scrollingBorderEnd
    }

    return 0
  }

  const getParentElement = (element: Node): Element | null => {
    const parent = element.parentElement
    if (parent == null) {
      return (element.getRootNode() as ShadowRoot).host || null
    }
    return parent
  }

  const getScrollMargins = (target: Element) => {
    const computedStyle = window.getComputedStyle(target)
    return {
      top: parseFloat(computedStyle.scrollMarginTop) || 0,
      right: parseFloat(computedStyle.scrollMarginRight) || 0,
      bottom: parseFloat(computedStyle.scrollMarginBottom) || 0,
      left: parseFloat(computedStyle.scrollMarginLeft) || 0,
    }
  }

  if (typeof document === 'undefined') {
    // If there's no DOM we assume it's not in a browser environment
    return { top: 0, left: 0 }
  }

  const { scrollMode, block, inline, boundary, skipOverflowHiddenElements } = options
  // Allow using a callback to check the boundary
  // The default behavior is to check if the current target matches the boundary element or not
  // If undefined it'll check that target is never undefined (can happen as we recurse up the tree)
  const checkBoundary = typeof boundary === 'function' ? boundary : (node: any) => node !== boundary

  if (!isElement(target)) {
    throw new TypeError('Invalid target')
  }

  // Used to handle the top most element that can be scrolled
  const scrollingElement = document.scrollingElement || document.documentElement

  // Collect all the scrolling boxes, as defined in the spec: https://drafts.csswg.org/cssom-view/#scrolling-box
  const frames: Element[] = []
  let cursor: Element | null = target
  while (isElement(cursor) && checkBoundary(cursor)) {
    // Move cursor to parent
    cursor = getParentElement(cursor)

    // Stop when we reach the viewport
    if (cursor === scrollingElement) {
      frames.push(cursor)
      break
    }

    // Skip document.body if it's not the scrollingElement and documentElement isn't independently scrollable
    if (cursor != null && cursor === document.body && isScrollable(cursor) && !isScrollable(document.documentElement)) {
      continue
    }

    // Now we check if the element is scrollable, this code only runs if the loop haven't already hit the viewport or a custom boundary
    if (cursor != null && isScrollable(cursor, skipOverflowHiddenElements)) {
      frames.push(cursor)
    }
  }

  // Support pinch-zooming properly, making sure elements scroll into the visual viewport
  // Browsers that don't support visualViewport will report the layout viewport dimensions on document.documentElement.clientWidth/Height
  // and viewport dimensions on window.innerWidth/Height
  // https://www.quirksmode.org/mobile/viewports2.html
  // https://bokand.github.io/viewport/index.html
  const viewportWidth = window.visualViewport?.width ?? innerWidth
  const viewportHeight = window.visualViewport?.height ?? innerHeight
  const { scrollX, scrollY } = window

  const { height: targetHeight, width: targetWidth, top: targetTop, right: targetRight, bottom: targetBottom, left: targetLeft } = target.getBoundingClientRect()
  const { top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft } = getScrollMargins(target)

  // These values mutate as we loop through and generate scroll coordinates
  let targetBlock: number = block === 'start' || block === 'nearest' ? targetTop - marginTop : block === 'end' ? targetBottom + marginBottom : targetTop + targetHeight / 2 - marginTop + marginBottom // block === 'center
  let targetInline: number = inline === 'center' ? targetLeft + targetWidth / 2 - marginLeft + marginRight : inline === 'end' ? targetRight + marginRight : targetLeft - marginLeft // inline === 'start || inline === 'nearest

  // Collect new scroll positions
  const computations: ScrollAction = { top: 0, left: 0 }
  // In chrome there's no longer a difference between caching the `frames.length` to a var or not, so we don't in this case (size > speed anyways)
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]

    // @TODO add a shouldScroll hook here that allows userland code to take control

    const { top, right, bottom, left } = frame.getBoundingClientRect()

    // If the element is already visible we can end it here
    // @TODO targetBlock and targetInline should be taken into account to be compliant with https://github.com/w3c/csswg-drafts/pull/1805/files#diff-3c17f0e43c20f8ecf89419d49e7ef5e0R1333
    if (
      scrollMode === 'if-needed' &&
      targetTop >= 0 &&
      targetLeft >= 0 &&
      targetBottom <= viewportHeight &&
      targetRight <= viewportWidth &&
      targetTop >= top &&
      targetBottom <= bottom &&
      targetLeft >= left &&
      targetRight <= right
    ) {
      // Break the loop and return the computations for things that are not fully visible
      return computations
    }

    const frameStyle = getComputedStyle(frame)
    const borderLeft = parseInt(frameStyle.borderLeftWidth as string, 10)
    const borderTop = parseInt(frameStyle.borderTopWidth as string, 10)
    const borderRight = parseInt(frameStyle.borderRightWidth as string, 10)
    const borderBottom = parseInt(frameStyle.borderBottomWidth as string, 10)

    let blockScroll: number = 0
    let inlineScroll: number = 0

    if (scrollingElement === frame) {
      // Handle viewport logic (document.documentElement or document.body)
      const nearestBlock = alignNearest(scrollY, scrollY + viewportHeight, viewportHeight, borderTop, borderBottom, scrollY + targetBlock, scrollY + targetBlock + targetHeight, targetHeight)

      const nearestInline = alignNearest(scrollX, scrollX + viewportWidth, viewportWidth, borderLeft, borderRight, scrollX + targetInline, scrollX + targetInline + targetWidth, targetWidth)

      if (block === 'start') {
        blockScroll = Math.abs(targetBlock) - Math.abs(nearestBlock)
      } else if (block === 'end') {
        blockScroll = nearestBlock < 0 ? -viewportHeight - targetHeight : viewportHeight - targetHeight
      } else if (block === 'nearest') {
        blockScroll = 0
      } else {
        // block === 'center' is the default
        blockScroll = nearestBlock < 0 ? (viewportHeight - targetHeight) / 2 : (viewportHeight - targetHeight) / 2
      }

      if (inline === 'start') {
        inlineScroll = Math.abs(targetInline) - Math.abs(nearestInline)
      } else if (inline === 'center') {
        inlineScroll = nearestInline < 0 ? -viewportWidth / 2 : viewportWidth / 2
      } else if (inline === 'end') {
        nearestInline < 0 ? -viewportWidth : viewportWidth
      } else {
        // inline === 'nearest' is the default
        inlineScroll = 0
      }
      // Apply scroll position offsets and ensure they are within bounds
      // @TODO add more test cases to cover this 100%
      blockScroll = Math.round(blockScroll)
      inlineScroll = Math.round(inlineScroll)

      if (webScroll && webScroll.force && (blockScroll || inlineScroll)) {
        target.scrollIntoView({
          block: options.block,
          inline: options.inline,
          behavior: options.behavior,
        })
        console.log('web scroll has been used')
      }
      return { el: frame, top: blockScroll, left: inlineScroll }
    }
  }
  return computations
}

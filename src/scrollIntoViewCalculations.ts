// MIT License

// Copyright (c) 2023 Cody Olsen

// adopted to w3c wheel actions

export type ScrollMode = 'always' | 'if-needed'
export interface Options {
  block?: ScrollLogicalPosition
  inline?: ScrollLogicalPosition
  scrollMode?: ScrollMode
  boundary?: Element | ((parent: Element) => boolean) | null
  skipOverflowHiddenElements?: boolean
  behavior?: ScrollBehavior
}
export interface ScrollAction {
  el?: Element
  top: number
  left: number
}
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
    if ((elementEdgeStart < scrollingEdgeStart && elementEdgeEnd > scrollingEdgeEnd) || (elementEdgeStart > scrollingEdgeStart && elementEdgeEnd < scrollingEdgeEnd)) {
      return 0
    }
    if ((elementEdgeStart <= scrollingEdgeStart && elementSize <= scrollingSize) || (elementEdgeEnd >= scrollingEdgeEnd && elementSize >= scrollingSize)) {
      return elementEdgeStart - scrollingEdgeStart - scrollingBorderStart
    }
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
    return { top: 0, left: 0 }
  }
  const { scrollMode, block, inline, boundary, skipOverflowHiddenElements } = options
  const checkBoundary = typeof boundary === 'function' ? boundary : (node: any) => node !== boundary
  if (!isElement(target)) {
    throw new TypeError('Invalid target')
  }
  const scrollingElement = document.scrollingElement || document.documentElement
  const frames: Element[] = []
  let cursor: Element | null = target

  while (isElement(cursor) && checkBoundary(cursor)) {
    cursor = getParentElement(cursor)

    if (cursor === scrollingElement) {
      frames.push(cursor)
      break
    }
    if (cursor != null && cursor === document.body && isScrollable(cursor) && !isScrollable(document.documentElement)) {
      continue
    }
    if (cursor != null && isScrollable(cursor, skipOverflowHiddenElements)) {
      frames.push(cursor)
    }
  }
  const viewportWidth = window.visualViewport?.width ?? innerWidth
  const viewportHeight = window.visualViewport?.height ?? innerHeight
  const { scrollX, scrollY } = window
  const { height: targetHeight, width: targetWidth, top: targetTop, right: targetRight, bottom: targetBottom, left: targetLeft } = target.getBoundingClientRect()
  const { top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft } = getScrollMargins(target)

  let targetBlock: number = block === 'start' || block === 'nearest' ? targetTop - marginTop : block === 'end' ? targetBottom + marginBottom : targetTop + targetHeight / 2 - marginTop + marginBottom // block === 'center
  let targetInline: number = inline === 'center' ? targetLeft + targetWidth / 2 - marginLeft + marginRight : inline === 'end' ? targetRight + marginRight : targetLeft - marginLeft // inline === 'start || inline === 'nearest

  const computations: ScrollAction = { top: 0, left: 0 }

  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]
    const { top, right, bottom, left } = frame.getBoundingClientRect()

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
      const nearestBlock = alignNearest(scrollY, scrollY + viewportHeight, viewportHeight, borderTop, borderBottom, scrollY + targetBlock, scrollY + targetBlock + targetHeight, targetHeight)
      const nearestInline = alignNearest(scrollX, scrollX + viewportWidth, viewportWidth, borderLeft, borderRight, scrollX + targetInline, scrollX + targetInline + targetWidth, targetWidth)

      if (block === 'start') {
        blockScroll = Math.abs(targetBlock) - Math.abs(nearestBlock)
      } else if (block === 'end') {
        blockScroll = 0
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
        blockScroll = 0
      } else {
        // inline === 'nearest' is the default
        inlineScroll = 0
      }
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

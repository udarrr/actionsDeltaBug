import { Options } from '../../src/scrollIntoViewCalculations'

import { compute } from '../../src/scrollIntoViewCalculations'
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf'

describe('possible solution', () => {
  it('should login with valid credentials', async () => {
    browser.overwriteCommand(
      'scrollIntoView',
      async function (
        _origin,
        options: Options = {
          scrollMode: 'if-needed',
          block: 'center',
          inline: 'nearest',
        }
      ) {
        try {
          const coords = (await browser.execute(
            compute,
            {
              //@ts-ignore
              [ELEMENT_KEY]: this.elementId, // w3c compatible
              //@ts-ignore
              ELEMENT: this.elementId, // jsonwp compatible
            },
            options
          )) as any
          await browser
            .action('wheel')
            .scroll({
              duration: 10,
              deltaX: coords.left,
              deltaY: coords.top,
              //@ts-ignore
              origin: this,
            })
            .perform(true)
            console.log('')
          await browser.execute(
            compute,
            {
              //@ts-ignore
              [ELEMENT_KEY]: this.elementId, // w3c compatible
              //@ts-ignore
              ELEMENT: this.elementId, // jsonwp compatible
            },
            options,
            { force: true }
          )
          console.log('')
        } catch {
          await browser.execute(
            (elem, options) => elem.scrollIntoView(options),
            {
              //@ts-ignore
              [ELEMENT_KEY]: this.elementId, // w3c compatible
              //@ts-ignore
              ELEMENT: this.elementId, // jsonwp compatible
            } as unknown as Element,
            options
          )
        }
       
      },
      true
    )
    await browser.url('https://blog.logrocket.com/hide-scrollbar-without-impacting-scrolling-css/')
    for (let scrollType of [
      '#cp_embed_JjxKdgP',
      '#cp_embed_wvNzMdN',
      '#cp_embed_abXZRex',
      '#cp_embed_JjxKdgP',
      '#cp_embed_wvNzMdN',
      '#cp_embed_abXZRex',
      '#cp_embed_JjxKdgP',
      '#cp_embed_wvNzMdN',
      '#cp_embed_abXZRex',
      '#cp_embed_JjxKdgP',
      '#cp_embed_wvNzMdN',
      '#cp_embed_abXZRex',
      '#cp_embed_JjxKdgP',
      '#cp_embed_wvNzMdN',
      '#cp_embed_abXZRex',
      '#cp_embed_JjxKdgP',
      '#cp_embed_wvNzMdN',
    ]) {
      const elm = await browser.$(scrollType)
      await elm.scrollIntoView()
      await browser.pause(2500)
    }
  })
})

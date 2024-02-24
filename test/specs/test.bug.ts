describe('deltaX in actions bug reproducible an example', () => {
  it('should login with valid credentials', async () => {
    browser.overwriteCommand(
      'scrollIntoView',
      async function () {
        await browser
          .action('wheel')
          .scroll({
            duration: 0,
            deltaX: 0,
            deltaY: 1000,
            //@ts-ignore
            origin: this,
          })
          .perform(true)
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

      expect(await elm.isDisplayedInViewport()).toBe(false)
    }
  })
})

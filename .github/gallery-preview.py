import sys
from pathlib import Path
from time import sleep
from playwright.sync_api import sync_playwright, expect

public = len(sys.argv) == 3
base = sys.argv[1] + ('?v=portrait-gallery' if public else '')
screens = Path('gallery-screenshots')
screens.mkdir(exist_ok=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome')
    desktop = browser.new_page(viewport={'width': 1440, 'height': 970}, device_scale_factor=1)
    if public:
        for attempt in range(24):
            try:
                desktop.goto(base+f'&check={attempt}#yesh-ir',timeout=10000)
                expect(desktop.locator('.portrait-dot').last).to_be_visible(timeout=3500)
                expect(desktop.locator('#track-count')).to_have_text('10 שירים',timeout=3500)
                break
            except Exception as exc:
                print(f'Waiting for Pages: {exc}',flush=True)
                sleep(8)
        else:
            raise AssertionError('Public deployment did not become ready')
    else:
        desktop.goto(base+'#yesh-ir')
        expect(desktop.locator('#track-count')).to_have_text('10 שירים')
    gallery = desktop.locator('.portrait-gallery')
    stage = desktop.locator('.portrait-stage')
    visible = desktop.locator('.portrait-slide.is-current img')
    dots = desktop.locator('.portrait-dot')
    current = desktop.locator('.portrait-dot[aria-current=true]')
    size = dots.count()
    assert size in ((7, 8) if public else (8,)), size
    opening = ('images/moshe-hillel.jpg' if size == 8 else 'images/portraits/Moshe-Hillel-01.webp')
    expect(dots.nth(0)).to_have_attribute('aria-current','true')
    expect(visible).to_have_attribute('src', opening)
    print(f'Live={public}: {size} portraits, opens with {opening}',flush=True)
    expect(desktop.locator('meta[property="og:image"]')).to_have_attribute('content',__import__('re').compile(r'/images/moshe-hillel\.jpg$'))
    dims=stage.bounding_box()
    copy=desktop.locator('.hero-copy').bounding_box()
    assert .43 < dims['width']/(dims['width']+copy['width']) < .47
    assert abs(dims['width']/dims['height']-.8)<.01
    assert visible.evaluate("img=>getComputedStyle(img).objectFit")=='contain'
    assert visible.evaluate("img=>getComputedStyle(img.parentElement).transitionDuration")=='0.8s'

    expect(dots.nth(1)).to_have_attribute('aria-current','true',timeout=6200)
    desktop.locator('.portrait-rotation').click()
    desktop.wait_for_timeout(4100)
    expect(dots.nth(1)).to_have_attribute('aria-current','true')
    desktop.locator('.portrait-rotation').click()
    expect(dots.nth(2)).to_have_attribute('aria-current','true',timeout=6200)
    desktop.locator('.portrait-rotation').click()

    # Each full frame is usable, selection does not resize the stage, and the dialog restores its trigger.
    for i in range(size):
        dots.nth(i).click()
        expect(dots.nth(i)).to_have_attribute('aria-current','true')
        assert visible.evaluate("img=>img.complete && img.naturalWidth > 0")
        assert stage.bounding_box()==dims
    desktop.locator('.portrait-next').click()
    expect(dots.nth(0)).to_have_attribute('aria-current','true')
    desktop.locator('.portrait-prev').click()
    expect(dots.nth(size-1)).to_have_attribute('aria-current','true')
    desktop.locator('.portrait-open').click()
    dialog=desktop.locator('.portrait-dialog')
    expect(dialog).to_be_visible()
    expect(dialog.locator('img')).to_have_attribute('src',__import__('re').compile('Moshe-Hillel-07.webp$'))
    desktop.keyboard.press('Escape')
    expect(dialog).not_to_be_visible()
    expect(desktop.locator('.portrait-open')).to_be_focused()
    desktop.keyboard.press('ArrowLeft')
    expect(dots.nth(0)).to_have_attribute('aria-current','true')

    if public:
        desktop.locator('#play').click()
        desktop.wait_for_function('audio.currentTime > .25 && !audio.paused')
        dots.nth(size-5).click()
        expect(dots.nth(size-5)).to_have_attribute('aria-current','true')
        desktop.wait_for_function('audio.currentTime > .6 && !audio.paused')
        desktop.locator('#seek').evaluate("""e=>{e.value=35;e.dispatchEvent(new Event('input'))}""")
        desktop.wait_for_function('audio.currentTime >= 34 && audio.currentTime < 40')
        desktop.locator('audio').evaluate('audio=>{audio.currentTime=audio.duration-.5}')
        desktop.wait_for_function("audio.currentSrc.includes('banjo') && audio.currentTime>.1")
        desktop.locator('#play').click()
        desktop.goto(base+'#ani-rak-zamar')
        expect(desktop.locator('#player-title')).to_have_text('אני רק זמר')
        expect(desktop.locator('#credits')).to_contain_text("ג'קי וול")
        if desktop.locator('.portrait-rotation').get_attribute('aria-label') == 'עצירת החלפה אוטומטית':
            desktop.locator('.portrait-rotation').click()
        dots.nth(size-5).click()
        expect(dots.nth(size-5)).to_have_attribute('aria-current','true')
        desktop.screenshot(path=str(screens/'Moshe-Hillel-Gallery-Desktop.jpg'),quality=92,animations='disabled')

    mobile = browser.new_page(**pw.devices['Pixel 7'],reduced_motion='reduce')
    mobile.goto(base+'#ahava-beashan-siach-vradim')
    expect(mobile.locator('#player-title')).to_have_text('אהבה בעשן – שיח ורדים')
    expect(mobile.locator('#lyrics p')).to_have_count(30)
    mdots=mobile.locator('.portrait-dot')
    expect(mobile.locator('.portrait-rotation')).to_have_accessible_name('הפעלת החלפה אוטומטית')
    expect(mdots.nth(0)).to_have_attribute('aria-current','true')
    assert mobile.locator('.portrait-slide').first.evaluate('el=>getComputedStyle(el).transitionDuration')=='0s'
    if not public:
        mobile.wait_for_timeout(4100)
        expect(mdots.nth(0)).to_have_attribute('aria-current','true')
    assert mobile.evaluate('document.documentElement.scrollWidth === innerWidth')
    geometry = mobile.evaluate("""() => ({
        viewport: innerHeight,
        player: document.querySelector('.player').getBoundingClientRect().top,
        frame: document.querySelector('.portrait-stage').getBoundingClientRect().height,
        play: document.querySelector('#play').getBoundingClientRect().bottom
    })""")
    print(f'Mobile geometry: {geometry}',flush=True)
    assert geometry['player'] < geometry['viewport']*.86, geometry
    box=mobile.locator('.portrait-open').bounding_box()
    x=box['x']+box['width']*.34
    y=box['y']+box['height']*.56
    session=mobile.context.new_cdp_session(mobile)
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+83,'y':y}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    expect(mdots.nth(1)).to_have_attribute('aria-current','true')
    expect(mobile.locator('.portrait-dialog')).not_to_be_visible()
    mobile.locator('.portrait-open').tap()
    expect(mobile.locator('.portrait-dialog')).to_be_visible()
    mobile.locator('.portrait-dialog button').tap()
    expect(mobile.locator('.portrait-dialog')).not_to_be_visible()
    if public:
        mdots.nth(size-2).tap()
        expect(mdots.nth(size-2)).to_have_attribute('aria-current','true')
        mobile.screenshot(path=str(screens/'Moshe-Hillel-Gallery-Mobile.jpg'),quality=92,animations='disabled')
    print('PASS: desktop and touch layouts, portraits, controls, reduced motion, links and lyrics',flush=True)

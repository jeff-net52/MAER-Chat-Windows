import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


url = os.environ.get("MAER_VISUAL_URL", "http://127.0.0.1:4174/tests/visual/shell.html")
output = Path(os.environ["MAER_VISUAL_OUTPUT"]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1366, "height": 900}, device_scale_factor=1)
    page.goto(url)
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("#maer-conversation-sidebar")

    geometry = page.evaluate(
        """
        () => {
          const box = (selector) => {
            const rect = document.querySelector(selector)?.getBoundingClientRect()
            return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          }
          const css = getComputedStyle(document.documentElement)
          return {
            rail: box('#maer-app-rail'),
            conversations: box('#controlbox'),
            chat: box('.chatbox:not(#controlbox)'),
            title: box('.maer-conversation-titlebar h1'),
            callButtons: document.querySelectorAll('.maer-audio-call, .maer-video-call, .maer-screen-call').length,
            sidebar: Boolean(document.querySelector('#maer-conversation-sidebar')),
            colors: {
              blue: css.getPropertyValue('--maer-blue').trim(),
              cyan: css.getPropertyValue('--maer-cyan').trim(),
            },
          }
        }
        """
    )

    page.screenshot(path=str(output), full_page=True)
    print(json.dumps({"ok": True, "screenshot": str(output), "geometry": geometry}, ensure_ascii=False))

    assert geometry["rail"]["x"] == 0, geometry
    assert 87 <= geometry["rail"]["width"] <= 90, geometry
    assert 70 <= geometry["conversations"]["x"] <= 74, geometry
    assert 400 <= geometry["conversations"]["width"] <= 430, geometry
    assert geometry["chat"]["x"] >= 470, geometry
    assert geometry["title"]["x"] >= geometry["rail"]["width"], geometry
    assert geometry["callButtons"] == 3, geometry
    assert geometry["sidebar"] is True, geometry
    assert geometry["colors"] == {"blue": "#0057b8", "cyan": "#0089e6"}, geometry

    browser.close()

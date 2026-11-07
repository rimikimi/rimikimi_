# 동남아(영어) 광고 소재 — HTML → 1080x1350 PNG. python3 render.py
import os
from playwright.sync_api import sync_playwright
d=os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1080,'height':1350})
    for n in ['concepts','magicbooth']:
        pg.goto('file://'+d+'/'+n+'.html');pg.wait_for_timeout(300);pg.screenshot(path=d+'/'+n+'.png')
    b.close()

"""Extract only imagery (never UI/text) from the approved reference images.
Temporary editorial assets; replace via catalogue asset resolver when backend content exists.
Run with Pillow from repository root. Original mockups remain untouched.
"""
from pathlib import Path
from PIL import Image

source = Path('docs/ux/customer-mobile/screen-specs')
target = Path('apps/customer-mobile/assets/catalogue')
target.mkdir(parents=True, exist_ok=True)
home = Image.open(source / 'Tirodhan_Collection_Home.png').convert('RGB')
names = [['flowers', 'havan', 'leaves', 'prasad'], ['idols', 'frames', 'yantras', 'decor'], ['books', 'mantras', 'calendars', 'pages'], ['fabrics', 'vastra', 'ornaments', 'altar']]
for row, (top, bottom) in zip(names, [(635, 724), (854, 944), (1076, 1157), (1280, 1355)]):
    for name, (left, right) in zip(row, [(148, 305), (317, 471), (481, 635), (646, 799)]):
        image = home.crop((left, top, right, bottom))
        image.save(target / f'{name}.webp', quality=88)
home.crop((451, 184, 799, 438)).save(target / 'hero.webp', quality=90)
otp = Image.open(source / 'Tirodhan_OTP_Error.png').convert('RGB')
otp.crop((500, 350, 817, 608)).save(target / 'otp.webp', quality=90)
activity = Image.open(source / 'Tirodhan_Activity.png').convert('RGB')
activity.crop((541, 355, 743, 566)).save(target / 'journey.webp', quality=90)
review = Image.open(source / 'Tirodhan_Review_Collection.png').convert('RGB')
review.crop((180, 1020, 314, 1105)).save(target / 'home-journey.webp', quality=90)
review.crop((399, 1018, 574, 1105)).save(target / 'rickshaw.webp', quality=90)

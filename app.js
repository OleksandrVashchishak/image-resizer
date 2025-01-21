const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const fs = require('fs');
const fsPromises = fs.promises;
const archiver = require('archiver');

const app = express();
const upload = multer({ dest: 'public/uploads/' });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

const logMessage = (message) => {
  const logFile = path.join(__dirname, 'log.txt');
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
};

app.get('/', (req, res) => {
  res.render('index', { message: '' });
});

app.post('/resize', upload.array('images', 200), async (req, res) => {
  const { newSize } = req.body;
  const newWidth = parseInt(newSize, 10);

  if (!newWidth || newWidth <= 0) {
    logMessage('Помилка: некоректна ширина.');
    return res.render('index', { message: 'Введіть коректну ширину!' });
  }

  try {
    const outputDir = path.join(__dirname, 'public', 'uploads', 'resized');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const totalFiles = req.files.length;
    const middleIndex = Math.floor(totalFiles / 2);
    logMessage(`Загальна кількість файлів: ${totalFiles}, середній індекс: ${middleIndex}`);

    for (const [index, file] of req.files.entries()) {
      const fileName = path.basename(file.originalname, path.extname(file.originalname));

      logMessage(`Обробляється файл: ${fileName}`);

      let cropWidth;

      if (index === middleIndex) {
        cropWidth = newWidth;
      } else {
        const distanceFromMiddle = Math.abs(middleIndex - index);
        const maxDistance = Math.max(middleIndex, totalFiles - middleIndex - 1);
        const scaleFactor = distanceFromMiddle / maxDistance;
        const originalWidth = (await sharp(file.path).metadata()).width;
        logMessage(`distanceFromMiddle: ${distanceFromMiddle}, maxDistance: ${maxDistance}, scaleFactor: ${scaleFactor}, originalWidth: ${originalWidth}`);
        cropWidth = Math.floor(newWidth + scaleFactor * (originalWidth - newWidth));
        logMessage(`cropWidth: ${cropWidth}`);
      }

      const outputPath = path.join(outputDir, `${fileName}--${cropWidth}.jpg`);

      await sharp(file.path)
        .resize({ width: cropWidth })
        .toFormat('jpeg')
        .toFile(outputPath);

      logMessage(`Файл збережено: ${outputPath}`);
    }


    const archiveName = `archive-${Date.now()}-${Math.floor(Math.random() * 1000000)}.zip`;
    const archivePath = path.join(__dirname, 'public', 'uploads', archiveName);
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(outputDir, false);
    await archive.finalize();

    logMessage('Архів створено.');
    res.render('index', { message: `Зображення успішно змінено! <a href="/uploads/${archiveName}">Завантажити архів</a>` });
  } catch (error) {
    logMessage(`Помилка: ${error.message}`);
    console.error(error);
    res.render('index', { message: `Сталася помилка: ${error.message}` });
  }
});

app.post('/delete-temp-files', async (req, res) => {
  try {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    const resizedDir = path.join(uploadDir, 'resized');
    
    // Видалення всіх файлів у папці uploads
    const filesInUpload = await fsPromises.readdir(uploadDir);
    for (const file of filesInUpload) {
      const filePath = path.join(uploadDir, file);
      const stat = await fsPromises.stat(filePath);
      
      if (stat.isFile()) {
        await fsPromises.unlink(filePath);
        logMessage(`Файл видалено: ${filePath}`);
      }
    }
    logMessage('Усі файли в папці uploads видалено.');

    // Видалення всіх файлів у папці resized
    const filesInResized = await fsPromises.readdir(resizedDir);
    for (const file of filesInResized) {
      const filePath = path.join(resizedDir, file);
      const stat = await fsPromises.stat(filePath);
      
      if (stat.isFile()) {
        await fsPromises.unlink(filePath);
        logMessage(`Файл видалено: ${filePath}`);
      }
    }
    logMessage('Усі файли в папці resized видалено.');

    res.render('index', { message: 'Усі файли в папках uploads та resized видалено!' });
  } catch (error) {
    logMessage(`Помилка при видаленні файлів: ${error.message}`);
    console.error(error);
    res.render('index', { message: `Сталася помилка при видаленні файлів: ${error.message}` });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  logMessage(`Сервер запущено на http://localhost:${PORT}`);
  console.log(`Сервер працює на http://localhost:${PORT}`);
});

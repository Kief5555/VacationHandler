//FILL IN THE BLANKS IN .ENV FILE


const express = require('express');
const fs = require('fs');
const path = require('path');
const basicAuth = require('basic-auth');
const sqlite3 = require('sqlite3').verbose();
const dayjs = require('dayjs');
const cors = require('cors');


const app = express();
const IMAGES_DIR = path.join(__dirname, 'images');
const db = new sqlite3.Database(':memory:'); // Using in-memory SQLite for simplicity
require('dotenv').config();
const PORT = process.env.PORT;

// Create the logs table
db.run('CREATE TABLE logs (id INTEGER PRIMARY KEY, timestamp TEXT, ip TEXT, userAgent TEXT, method TEXT, url TEXT)');

// Middleware to log requests
app.use(cors({ credentials: true, origin: true }));
app.use((req, res, next) => {
    const log = {
        timestamp: dayjs().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        method: req.method,
        url: req.url
    };

    db.run('INSERT INTO logs (timestamp, ip, userAgent, method, url) VALUES (?, ?, ?, ?, ?)',
        [log.timestamp, log.ip, log.userAgent, log.method, log.url]);

    next();
});


// GET route to return an image by name
app.get('/:city/:image', (req, res) => {
    const password = req.query.password;
    if (password !== process.env.PASSWORD) return res.status(401).send({ status: false, errors: ['Access denied.'] });
    const imagePath = path.join(IMAGES_DIR, req.params.city, req.params.image);
    if (!fs.existsSync(imagePath)) return res.status(404).send({ status: false, errors: ['Image not found.'] });

    //More cache headers for cloudflare
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Expires', new Date(Date.now() + 31536000).toUTCString());

    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(imagePath);
});

// Middleware for basic auth
const authMiddleware = (req, res, next) => {
    const user = basicAuth(req);
    if (!user || user.pass !== process.env.PASSWORD) {
        res.set('WWW-Authenticate', 'Basic realm="example"');
        return res.status(401).json({ status: false, errors: ['Invalid credentials'] });
    }
    next();
};

// Helper function to get images in a city folder
const getImages = (city) => {
    const cityDir = path.join(IMAGES_DIR, city);
    if (!fs.existsSync(cityDir)) return [];

    return fs.readdirSync(cityDir).map((fileName) => ({
        name: fileName,
        location: `https://${process.env.HOSTNAME}/${city}/${fileName}?password=${process.env.PASSWORD}`
    }));
};

// GET route to list all cities
app.get('/cities', authMiddleware, (req, res) => {
    const cities = fs.readdirSync(IMAGES_DIR).filter((file) => fs.statSync(path.join(IMAGES_DIR, file)).isDirectory());
    res.json({ status: true, cities });
});

// GET route to view all images
app.post('/images', authMiddleware, (req, res) => {
    let allImages = [];

    fs.readdirSync(IMAGES_DIR).forEach((city) => {
        const images = getImages(city);
        allImages = allImages.concat(images);
    });

    //Drop duplicate images, if any (allow the first one to stay)
    allImages = allImages.filter((image, index, self) =>
        index === self.findIndex((t) => (
            t.name === image.name
        ))
    );
    res.json({ status: true, images: allImages });
});

// POST route to get images by city
app.post('/:city', authMiddleware, (req, res) => {
    const images = getImages(req.params.city);
    res.json({ status: true, images });
});


// GET route to redirect to the frontend
app.get('/:city', (req, res) => {
    res.redirect(`https://printedwaste.com/v/?city=${req.params.city}`);
});

app.get('/', (req, res) => {
    res.redirect('https://printedwaste.com/v/');
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
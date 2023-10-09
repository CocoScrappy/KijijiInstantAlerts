
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import "dotenv/config";

const db = new sqlite3.Database('./db/VovaKijijiAlerter_db.db');
const saltRounds = 10;

async function initializeDatabase() {
    await new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS Users (
                userID INTEGER PRIMARY KEY,
                username TEXT,
                email TEXT UNIQUE,
                password TEXT
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    await new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS Chats (
                userID INTEGER,
                chatID INTEGER PRIMARY KEY,
                FOREIGN KEY (userID) REFERENCES Users(userID)
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    await new Promise((resolve, reject) => {
        db.run(`
        CREATE TABLE IF NOT EXISTS Links (
            urlID INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT,
            chatID INTEGER,
            FOREIGN KEY (chatID) REFERENCES Chats(chatID)
        )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    await new Promise((resolve, reject) => {
    //OPTIONAL _______________________________________________________________________
    // populate with first record chatid = 955679628 and url from .env
    db.run(`INSERT INTO Links (url, chatID) VALUES ('${process.env.URL_TO_SEARCH}', 5456698432)`);
    // populate chats table with chatid = 955679628 and userid = 1
    db.run(`INSERT INTO Chats (userID, chatID) VALUES (1, 5456698432)`);
    // encrypt password Vivi123 and populate table users with kizyakov.d@gmail.com, kizyakov.d username
    bcrypt.hash('Vivi123', saltRounds, function (err, hash) {
        db.run(`INSERT INTO Users (username, email, password) VALUES ('Vova', 'vlad_106@hotmail.com', '${hash}')`);
        console.log(hash);
    }), (err) => {
        if (err) reject(err);
        else resolve();
    };
    });
    //________________________________________________________________________________
}

initializeDatabase()
    .then(() => {
        console.log('Database initialized successfully.');
        db.close();
    })
    .catch((err) => {
        console.error('Error initializing database:', err);
        db.close();
    });
# CLTT – Chemistry Lab Testing Tool

## Overview

CLTT (Chemistry Lab Testing Tool) is a full-stack web application designed to simplify the process of searching and managing chemical information. The platform enables students, teachers, laboratory professionals, and researchers to quickly search chemical elements and compounds, view chemical formulas, and access laboratory-related information through a modern web interface.

The application is built with a secure authentication system, a scalable backend, and a MongoDB database to provide fast and reliable access to chemical data.

---

## Features

* User Registration and Login
* Secure JWT Authentication
* Firebase Authentication Integration
* Search Chemical Elements
* Search Chemical Compounds
* Chemical Formula Display
* Chemical Information Management
* Responsive Dashboard
* Secure REST API
* MongoDB Database Integration
* Modern User Interface
* Error Handling and Validation

---

## Technology Stack

### Frontend

* HTML5
* CSS3
* JavaScript (Vanilla JS)

### Backend

* Node.js
* Express.js

### Database

* MongoDB Atlas
* Mongoose

### Authentication

* JSON Web Token (JWT)
* Firebase Authentication

### Deployment

* Railway

---

## Project Structure

```text
CLTT/
│
├── frontend/
├── backend/
├── config/
├── controllers/
├── middleware/
├── models/
├── routes/
├── public/
├── package.json
├── .env
└── README.md
```

---

## Installation

### Clone Repository

```bash
git clone https://github.com/your-username/CLTT.git
```

### Move into Project

```bash
cd CLTT
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env` file in the project root.

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret

CORS_ORIGINS=http://localhost:3000
```

### Start the Server

```bash
npm start
```

or

```bash
npm run dev
```

---

## API Features

* User Registration
* User Login
* JWT Authentication
* Protected Routes
* Chemical Search API
* Chemical Formula API
* Dashboard API

---

## Database

The application uses MongoDB Atlas for storing:

* User Information
* Chemical Elements
* Chemical Compounds
* Authentication Data

---

## Security

* Password Encryption
* JWT Authentication
* Protected APIs
* Environment Variables
* Input Validation
* Error Handling

---

## Target Users

* Students
* Chemistry Teachers
* Laboratory Technicians
* Researchers
* Educational Institutions

---

## Future Improvements

* AI-assisted chemical recommendations
* Laboratory experiment management
* Chemical reaction simulator
* PDF report generation
* Advanced filtering
* Multi-language support
* Admin analytics dashboard
* Mobile application

---

## Deployment

The project is deployed using Railway.

---

## License

This project is intended for educational and learning purposes.

---

## Author

Developed by **Suvarna Basanakatti**

Third Year Engineering Student

Aspiring Full Stack Developer

Passionate about Web Development, Backend Engineering, Cloud Computing, and AI.

---

## Acknowledgements

Special thanks to the open-source community and the developers behind Node.js, Express.js, MongoDB, Firebase, and Railway for providing the tools that made this project possible.


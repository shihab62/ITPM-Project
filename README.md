Presentation Registration System

A complete web-based Student Presentation Registration & Management System developed to make the presentation registration, team management, scheduling, submission, communication, and evaluation process easier for students, teachers, CRs, and administrators.

The system provides a centralized platform where students can register individually or in teams, manage their presentation information, submit files, communicate with others, and access presentation-related academic activities.

Project Overview

The Presentation Registration System was developed as a practical solution for managing student presentations in an organized digital environment.

Instead of handling student registration, team lists, presentation slots, assignments, lab reports, files, reviews, and communication manually, the system brings these activities together in a single platform.

The system is designed with separate access and management features for:

Students

Team Leaders

Teachers

CRs

Administrators

Main Features

📝 Presentation Registration

Students can register for presentations through the website.

Individual registration

Team registration

Team name creation

Team member information

Team leader selection

Student ID and personal information

Subject-wise registration

Presentation topic

Presentation slot selection

Registration reference number

Duplicate registration checking

👥 Team Management

Students can participate individually or as a team.

Create presentation teams

Add multiple team members

Select team leader

Manage team information

View registered teams

Public team information

Team-wise presentation details

📚 Subject Management

Presentation registration is organized according to subjects.

Teachers/CRs can manage their assigned subjects and related presentation activities.

Subject information can include:

Subject name

Course code

Department

Program

Batch

Semester

Teacher information

Registration settings

Team size limitations

Presentation slots

👨‍🏫 Teacher & CR Panel

Teachers and CRs can manage presentation activities related to their subjects.

Features include:

View registered students

View teams

Manage presentation registrations

Manage presentation slots

View submitted presentation files

Manage assignments

Manage lab reports

Review presentation-related information

🎤 Presentation Management

The system provides dedicated functionality for presentation-related files and activities.

Students can upload their presentation files, while authorized users can view and manage those submissions.

The system also provides a full-screen presenter/viewing interface for presentation content.

📂 Assignments & Lab Reports

The platform includes academic file management for:

Assignments

Lab reports

Student submissions

Subject-wise academic tasks

Submitted files

Teachers/CRs can manage and review the submitted academic files.

💬 Chat & Communication

The system includes a built-in communication system for users.

Users can communicate through the platform without needing to use a separate application for presentation-related discussions.

⭐ Review & Feedback

A review and feedback system is included for presentation-related evaluation.

Authorized users can provide reviews and feedback based on presentations and submitted work.

🌐 Public Team Page

The system provides a public view of registered presentation teams.

Visitors can view available team and presentation information without accessing private administrative features.

📊 Analytics

The administrator can monitor system activity through analytics.

The analytics system can provide information such as:

Visitors

Online visitors

Visitor activity

Viewed pages

User/device information

Activity history

Usage statistics

⚙️ Admin Management

The administrator has overall control of the system.

The admin panel provides management features for:

Students

Teachers

CRs

Subjects

Registrations

Teams

Presentation slots

Assignments

Lab reports

Reviews

Chat

Accounts

System settings

Analytics

Data export

Backup and restore

💾 Backup & Restore

The system includes backup and restore functionality for important application data.

This helps administrators maintain and recover presentation-related data when necessary.

📱 Mobile & PWA Support

The website is designed to work on both desktop and mobile devices.

It also supports Progressive Web App (PWA) features, allowing the website to be installed on supported devices and used similar to a mobile application.

Technology Used

Frontend

HTML5

CSS3

JavaScript

Backend

PHP

Database

MySQL

Additional Technologies

REST-style JSON API

Progressive Web App (PWA)

File Upload System

PDF presentation support

Responsive UI

Project Structure

The project is organized into separate frontend, backend, database, and supporting components.

project/
│
├── frontend/
│   ├── index.html
│   ├── about.html
│   ├── contact.html
│   ├── login.html
│   ├── register.html
│   ├── css/
│   ├── js/
│   └── images/
│
├── backend/
│   ├── controllers/
│   ├── server/
│   ├── routes/
│   └── storage/
│
├── database/
│   └── database.sql
│
├── router.php
├── start-server.bat
├── start-server.sh
└── README.md

The frontend handles the user interface, while the PHP backend manages authentication, registration, database operations, file handling, team management, reviews, chat, administration, and other system functionality.

How to Run the Project

Requirements

PHP 7.4 or newer

MySQL

XAMPP / WAMP / Laragon

Modern web browser

Running on Windows

Install XAMPP.

Start MySQL from the XAMPP Control Panel.

Open the project folder in VS Code.

Open the terminal.

Start the PHP development server:

php -S localhost:8000 router.php

Open:

http://localhost:8000

The project also includes a start-server.bat file for easier startup on Windows.

Database

The project uses MySQL for storing system data.

The included:

database/database.sql

contains the database structure.

The database connection can be configured according to the local MySQL environment.

Default Admin

The system includes an administrator account for initial setup.

After the first login, the administrator should change the default password from the system settings.

Security & Access Control

Different users have different levels of access within the system.

Students can manage their own presentation-related activities.

Team leaders can manage team-related information.

Teachers/CRs can manage their assigned academic activities.

Administrators have overall system control.

The system also includes authentication, session management, CSRF protection, controlled API access, and restricted administrative operations.

Purpose of the Project

The primary goal of this project is to digitize and simplify the student presentation management process.

It reduces the need for manual registration lists, repeated messaging, spreadsheet-based team management, and scattered presentation files.

Through this platform, students, teachers, CRs, and administrators can manage presentation-related activities from a single centralized system.

Future Improvements

The system can be further expanded with additional features such as:

Advanced notification system

Email notifications

More detailed evaluation systems

Department-wide deployment

Advanced reporting

More mobile-specific features

Additional academic management modules

Developer

Developed by

MD Mohosin Shihab

Department of Computer Science & Engineering
Feni University

This project was developed as a practical web-based solution for student presentation registration and management.
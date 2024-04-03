const { PubSub } = require('@google-cloud/pubsub');
const { Sequelize, DataTypes } = require('sequelize');
const mailgun = require("mailgun-js");
const functions = require('@google-cloud/functions-framework');
const DOMAIN = 'verifyemail.cloudwebappserver.com';
const mg = mailgun({apiKey: '4b552d5c1cd188486cde6483ae5b49aa-f68a26c9-47f153c2', domain:'verifyemail.cloudwebappserver.com'});


const DB_NAME =process.env.DB_NAME;
const DB_USER =process.env.DB_USER;
const DB_PASSWORD =process.env.DB_PASSWORD;
const DB_HOST =process.env.DB_HOST;
const CLOUDSQL_INSTANCE_CONNECTION_NAME =process.env.CLOUDSQL_INSTANCE_CONNECTION_NAME; 


const sequelize = new Sequelize({
  dialect: 'postgres',
  host: DB_HOST,
  dialectOptions: {
    socketPath: `/cloudsql/${CLOUDSQL_INSTANCE_CONNECTION_NAME}`
  },
  database: DB_NAME,
  username: DB_USER,
  password: DB_PASSWORD,
  port:'5432'
});

const test = async () => {
try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  } 
};


const generateVerificationUrl = (username) => {
    const encodedEmail = Buffer.from(username).toString('base64');
    const baseUrl = 'https://cloudwebappserver.com.:443/v1/user';
    return `${baseUrl}/verify?uid=${encodeURIComponent(encodedEmail)}`;
};

const sendVerificationEmail = async (username, verificationUrl, first_name, last_name) => {
    const data = {
        from: 'WebApi <mailgun@verifyemail.cloudwebappserver.com>',
        to: username,
        subject: 'Verify Your Email Address',
        text: `Thank you for registering with us. Please click the link to verify your email address: ${verificationUrl}`,
        html: `
        <html>
            <body>
                <p>Hi ${first_name} ${last_name},</p>
                <p>Thank you for registering with us. To complete the signup process, please verify your email address by clicking the link below.</p>
                <p><a href="${verificationUrl}">Verify Email</a></p>
                <p>If you did not create an account using this email address, please ignore this email or alert us.</p>
                <p>Best,</p>
                <p>Your Company Team</p>
            </body>
        </html>`
    };

    mg.messages().send(data, function (error, body) {
        if (error) {
            console.error('Failed to send verification email:', error);
        } else {
            console.log('Verification email sent successfully:', body);
        }
    });
};

const extractUidFromVerificationUrl = (verificationUrl) => {
  const urlParts = verificationUrl.split('=');
  return decodeURIComponent(urlParts[urlParts.length - 1]);
};

exports.verifyEmail = async (event, context) => {
    const pubSubMessage = event.data ? JSON.parse(Buffer.from(event.data, 'base64').toString()) : {};

    const { username, first_name, last_name } = pubSubMessage; // Extract first_name and last_name

    // Generate verification URL
    const verificationUrl = generateVerificationUrl(username);

    const verificationUid = extractUidFromVerificationUrl(verificationUrl);


    try {

        await test();

        await sequelize.query('INSERT INTO "Verifies" ("username", "uid", "createdAt", "updatedAt", "verified") VALUES (?, ?, ?, ?, ?)', {
            replacements: [username, verificationUid, new Date(), new Date(), false],
            type: sequelize.QueryTypes.INSERT
        }).catch(error => {
  console.error('Error inserting into Verifies table:', error);
});


        // Send verification email
        await sendVerificationEmail(username, verificationUrl, first_name, last_name);

        return {
            status: 'success',
            message: 'Verification email sent successfully',
        };
    } catch (error) {
        return {
            status: 'error',
            message: 'Failed to send verification email',
            error: error.message
        };
    }
};
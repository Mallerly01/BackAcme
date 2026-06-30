
require('dotenv').config();
var express = require('express');
var mysql = require('mysql2');
const bodyParser = require('body-parser');
var fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
var cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const   GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const EMAIL_CLIENT_ID = process.env.EMAIL_CLIENT_ID;
const EMAIL_CLIENT_SECRET = process.env.EMAIL_CLIENT_SECRET;
const EMAIL_REDIRECT_URI = process.env.EMAIL_REDIRECT_URI;
const EMAIL_REFRESH_TOKEN = process.env.EMAIL_REFRESH_TOKEN;

const OAuth2 = google.auth.OAuth2;
const oauth2Client = new OAuth2(
    EMAIL_CLIENT_ID,
    EMAIL_CLIENT_SECRET,
    EMAIL_REDIRECT_URI
);

oauth2Client.setCredentials(
    { refresh_token: EMAIL_REFRESH_TOKEN }
);

const smptTransport = nodemailer.createTransport({
    service: "gmail",
    auth: {
        type: "OAuth2",
        user: "mallerly.carrasco2201@alumnos.ubiobio.cl",
        clientId: EMAIL_CLIENT_ID,
        clientSecret: EMAIL_CLIENT_SECRET,
        refreshToken: EMAIL_REFRESH_TOKEN,
        accessToken: async () => {
            const { token } = await oauth2Client.getAccessToken();
            return token;
        }
    }
});


var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(fileUpload());
app.use(function(req, res, next){
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 
        'Origin, X-Requested-with, Content-Type, Accept, x-client-key, x-client-token, x-client-secret, Authorization');
    next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

var conn= mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3307,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'acme'
});

conn.connect(err => {
    if (err) {
        console.error('Error conectando a MySQL:', err);
        return;
    }
    console.log('Conectado a MySQL');
});

var jwt = require('jsonwebtoken');
let SEED = "esta-es-una-semilla-para-generar-el token";

// Enviar Email de Prueba
app.post('/email-test', (req, res) => {
    let msg = ` <h3>
                    <span style="background-color: #ffcc00;">
                        Envío de Email con NodeJS - Nodemailer y GMail
                    </span>
                </h3>
                <p>Este es un <strong> email de ejemplo </strong> utilizando
                    <span style="color: #ff0000;">Nodemailer</span> y <em>NodeJS</em>.
                </p>
                <ul>
                    <li>Permite formato HTML</li>
                    <li>Permite adjuntar archivos</li>
                    <li>Se utiliza una cuenta GMail configurada con OAuth2</li>
                </ul>`;

    const { email_adress } = req.body;

    const mailOptions = {
        from: "Asignatura Angular",
        to: email_adress,
        subject: "Email de ejemplo con nodemailer",
        generateTextFromHTML: true,
        html: msg
    };

    smptTransport.sendMail(mailOptions, (err, response) => {
        if(err){
            console.log(err);
            throw err;
        }
        console.log(response);
        smptTransport.close();
        res.status(200).json({
            ok: true,
            mensaje: 'Email enviado correctamente'
        });
    });
});    

app.post('/google-login', async (req, res) => {
    const { googletoken } = req.body;
    console.log('Token recibido: ' + googletoken);
    try{
        const { name, email, picture } = await verifyGoogleToken(googletoken);
        conn.query('SELECT * FROM usuarios WHERE userEmail = ?', [email], (err, results) => {
            if (err) {
                return res.status(500).json({
                    ok: false,
                    mensaje: 'Error al consultar la base de datos',
                    error: err
                });
            }
            if (results.length === 0) {
                console.log('Usuario no encontrado -> creando nuevo usuario');
                let datosUsuario = {
                    userName: name,
                    userEmail: email,
                    userImg: picture,
                    userPassword: '',
                };
                conn.query('INSERT INTO usuarios SET ?', datosUsuario, (err, result) => {
                    if (err) {
                        console.error('Error INSERT MySQL:', err);
                        return res.status(500).json({
                            ok: false,
                            mensaje: 'Error al crear el usuario',
                            error: err
                        });
                    }
                    conn.query('SELECT * FROM usuarios WHERE userEmail = ?', [email], (err, results) => {
                        if (err) {
                            return res.status(500).json({
                                ok: false,
                                mensaje: 'Error al consultar el usuario creado',
                                error: err
                            });
                        }
                        const user = results[0];
                        const token = jwt.sign({ usuario: user }, SEED, { expiresIn: 14400 });
                        res.status(200).json({
                            ok: true,
                            mensaje: 'Login exitoso',
                            usuario: user,
                            token: token
                        });
                    });
                });
            } else {
                console.log('Usuario encontrado');
                console.log('Generar token para usuario');
                const user = results[0];
                const token = jwt.sign({ usuario: user }, SEED, { expiresIn: 14400 });
                res.status(200).json({
                    ok: true,
                    mensaje: 'Login exitoso',
                    usuario: user,
                    token: token
                });
            }
        });
    } catch (error) {
        res.status(401).json({
            ok: false,
            mensaje: 'Token no valido',
            error: error
        });
    }
});

async function verifyGoogleToken(token) {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    console.log(payload);
    return {
        name: payload.name,
        email: payload.email,
        picture: payload.picture
    };
}

// Registro Usuario
app.post('/usuarios', (req, res) => {
  const { name, email, img, role } = req.body;
  let hashedPassword = bcrypt.hashSync(req.body.password, 10);

  const sql = `INSERT INTO usuarios (userName, userEmail, userPassword, userImg, userRole)
  VALUES (?, ?, ?, ?, ?)`;
  conn.query(sql, [name, email, hashedPassword, img, role], (err, result) => {
    if (err) throw err;
    res.status(201).json({
      ok: true,
      mensaje: 'Usuario registrado correctamente'
    });
  });

});

app.post('/login', (req, res) => {
  const { email } = req.body;
  let hashedPassword = bcrypt.hashSync(req.body.password, 10);
  const sql = 'SELECT * FROM usuarios WHERE userEmail = ?';
  conn.query(sql, [email], (err, results) => {
    if (err) throw err;
    if (results.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: 'Usuario no encontrado'
      });
    } else {
      const user = results[0];
      const passwordMatch = bcrypt.compareSync(req.body.password, user.userPassword);
      if (!passwordMatch) {
        return res.status(401).json({
          ok: false,
          mensaje: 'Contraseña incorrecta'
        });
      }

      const token = jwt.sign({ usuario: user }, SEED, {expiresIn: 14400 });

      res.status(200).json({
        ok: true,
        mensaje: 'Login exitoso',
        usuario: user,
        token: token
      });
    }
  });
});

// Forgot Password
app.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    const mensaje = 'Si el email existe, recibirás un link de recuperación.';

    conn.query('SELECT * FROM usuarios WHERE userEmail = ?', [email], (err, results) => {
        if (err) {
            return res.status(500).json({ ok: false, mensaje: 'Error interno' });
        }

        if (results.length === 0) {
            return res.status(200).json({ ok: true, mensaje });
        }

        const user = results[0];
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000).toISOString().replace('T', ' ').replace('Z', '');

        conn.query(
            'INSERT INTO password_resets (userId, token, expiresAt) VALUES (?, ?, ?)',
            [user.userId, token, expiresAt],
            (err) => {
                if (err) {
                    console.log(err);
                    return res.status(200).json({ ok: true, mensaje });
                }

                const resetLink = `http://localhost:4200/reset-password?token=${token}`;

                console.log(`[forgot-password] Token generado para ${email}: ${token}`);

                smptTransport.sendMail({
                    from: "Asignatura Angular",
                    to: email,
                    subject: "Recuperación de contraseña",
                    html: `<h3>Recuperación de contraseña</h3>
                           <p>Has solicitado restablecer tu contraseña.</p>
                           <p>Haz clic en el siguiente link:</p>
                           <a href="${resetLink}">Restablecer contraseña</a>
                           <p>Este link expira en 1 hora.</p>
                           <p>Si no solicitaste esto, ignora este mensaje.</p>`
                }, (err) => {
                    if (err) {
                        console.error('[forgot-password] Error al enviar email:', err);
                        return res.status(200).json({ ok: true, mensaje });
                    }
                    console.log('[forgot-password] Email enviado correctamente a:', email);
                    res.status(200).json({ ok: true, mensaje });
                });
            }
        );
    });
});

// Reset Password
app.post('/reset-password', (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ ok: false, mensaje: 'Token y contraseña son requeridos' });
    }

    if (password.length < 6) {
        return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres' });
    }

    console.log(`[reset-password] Token recibido: ${token ? token.substring(0, 16) + '...' : 'N/A'}`);

    conn.query(
        'SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expiresAt > UTC_TIMESTAMP()',
        [token],
        (err, results) => {
            if (err) {
                console.error('[reset-password] Error en consulta:', err);
                return res.status(500).json({ ok: false, mensaje: 'Error interno' });
            }

            if (results.length === 0) {
                console.log('[reset-password] Token no encontrado, usado o expirado');
                return res.status(400).json({ ok: false, mensaje: 'Token inválido o expirado' });
            }

            console.log('[reset-password] Token válido, actualizando contraseña...');
            const reset = results[0];
            const hashedPassword = bcrypt.hashSync(password, 10);

            conn.query(
                'UPDATE usuarios SET userPassword = ? WHERE userId = ?',
                [hashedPassword, reset.userId],
                (err) => {
                    if (err) {
                        console.error('[reset-password] Error al actualizar contraseña:', err);
                        return res.status(500).json({ ok: false, mensaje: 'Error al actualizar contraseña' });
                    }

                    conn.query(
                        'UPDATE password_resets SET used = 1 WHERE id = ?',
                        [reset.id],
                        (err) => {
                            if (err) console.error('[reset-password] Error al marcar token como usado:', err);
                            console.log('[reset-password] Contraseña actualizada exitosamente');
                            res.status(200).json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
                        }
                    );
                }
            );
        }
    );
});

app.use(function(req, res, next){
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({
      ok: false,
      mensaje: 'Token no proporcionado'
    });
  }else{

    jwt.verify(token, SEED, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          ok: false,
          mensaje: 'Token no válido'
        });
      }
      req.usuario = decoded.usuario;
      next();
    });
  }
});

app.get('/existeproducto/:code', (req, res) =>{
    const sql = 'SELECT * FROM productos WHERE productCode = ?';
    conn.query(sql, req.params.code, (err, result) => {
        if(err) throw err;
        res.status(200).json({
            ok: true,
            data: result[0],
            existe: result.length > 0
        });
    });
});

//Recupera los productos de la base de datos
app.get('/productos', (req, res) => {
    const sql = 'SELECT * FROM productos';
    conn.query(sql, (err, results) => {
        if (err) throw err;
        res.status(200).json({
            ok: true,
            productos: results
        })
    });
});

//Recupera los 5 productos con mejor ranking
app.get('/productos/top-rated', (req, res) => {
    const sql = 'SELECT productName, starRating FROM productos ORDER BY starRating DESC, productName ASC LIMIT 5';
    conn.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({
                ok: false,
                mensaje: 'Error al consultar productos',
                error: err
            });
        }
        const data = results.map(p => ({
            name: p.productName,
            value: p.starRating
        }));
        res.status(200).json({
            ok: true,
            data: data
        });
    });
});

//Añadir un nuevo producto a la base de datos
app.post('/productos', (req, res) => {
    const { name, code, date, price, description, rate } = req.body;
    let imageUrl = req.body.image || '';

    const insertProduct = (imgUrl) => {
        const sql = 'INSERT INTO productos (productName, productCode, releaseDate, price, description, starRating, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)';
        conn.query(sql, [name, code, date, parseInt(price) || 0, description, parseInt(rate) || 0, imgUrl], (err, results) => {
            if (err) throw err;
            res.status(201).json({
                ok: true,
                mensaje: 'Producto creado exitosamente'
            });
        });
    };

    if (req.files && req.files.image) {
        const file = req.files.image;
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif'];

        if (!allowedExtensions.includes(fileExtension)) {
            return res.status(400).json({ ok: false, mensaje: 'Formato de archivo no permitido' });
        }

        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;
        const uploadPath = path.join(__dirname, 'uploads', 'productos', fileName);

        fs.mkdirSync(path.dirname(uploadPath), { recursive: true });

        file.mv(uploadPath, (err) => {
            if (err) {
                return res.status(500).json({ ok: false, mensaje: 'Error al subir el archivo' });
            }
            insertProduct(`/uploads/productos/${fileName}`);
        });
    } else {
        insertProduct(imageUrl);
    }
});

//Elimina un producto de la base de datos
app.delete('/productos/:productId', (req, res) => {
    const sql = 'DELETE FROM productos WHERE productId = ?';
    conn.query(sql, [req.params.productId], (err, results) => {
        if (err) throw err;
        res.status(200).json({
            ok: true,
            mensaje: 'Producto eliminado exitosamente'
        });
    });
});

//Actualiza un producto existente en la base de datos
app.put('/productos/:productId', (req, res) => {
    const { name, code, date, price, description, rate } = req.body;
    const sql = 'UPDATE productos SET productName = ?, productCode = ?, releaseDate = ?, price = ?, description = ?, starRating = ? WHERE productId = ?'; 
    conn.query(sql, [name, code, date, parseInt(price) || 0, description, parseInt(rate) || 0, req.params.productId], (err, results) => {
        if (err) throw err;
        res.status(200).json({
            ok: true,
            mensaje: 'Producto actualizado exitosamente'
        });
    });
});

//Sube la imagen a un producto existente
app.put('/upload/productos/:id', (req, res) =>{
    if(!req.files || Object.keys(req.files).length === 0){
        return res.status(400).json({ 
            ok: false, 
            mensaje: 'No se ha subido ningún archivo' 
        });
    }
    const file = req.files.image;
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif'];
    
    if(!allowedExtensions.includes(fileExtension)){
        return res.status(400).json({ 
            ok: false, 
            mensaje: 'Formato de archivo no permitido' 
        });
    }
    const productId = req.params.id;
    const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;
    const uploadPath = path.join(__dirname, 'uploads', 'productos', fileName);
    const imageUrl = `/uploads/productos/${fileName}`;

    console.log(uploadPath);

    fs.mkdirSync(path.dirname(uploadPath), { recursive: true });

    file.mv(uploadPath, (err) =>{
        if(err){
            return res.status(500).json({
            ok: false,
            mensaje: 'Error al subir el archivo',
            error: err
        });
        }
        const sql = 'UPDATE productos SET imageUrl = ? WHERE productId = ?';
        conn.query(sql, [imageUrl, productId], (err, results) => {
            if (err) throw err;
            res.status(200).json({
                ok: true,
                mensaje: 'Archivo subido y producto actualizado exitosamente'
            });
        });
    });
});


app.listen(3000, () => {
    console.log('Servidor escuchando en el puerto 3000');
});

var express = require('express');
var mysql = require('mysql2');
const bodyParser = require('body-parser');
var fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
var cors = require('cors');
const bcrypt = require('bcryptjs');

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

conn.connect();

var jwt = require('jsonwebtoken');
let SEED = "esta-es-una-semilla-para-generar-el token";


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
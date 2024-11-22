const mongoose = require('mongoose');

const url = "mongodb+srv://quanbui0999:quan147@cluster0.ovfa2.mongodb.net/duantotnghiep?retryWrites=true&w=majority&appName=Cluster0"; 

async function connectDb() {
    try {
        await mongoose.connect(url, {
            serverSelectionTimeoutMS: 50000,
        });
        console.log('Kết nối thành công đến server');
        return mongoose.connection;
    } catch (error) {
        console.error('Kết nối đến cơ sở dữ liệu thất bại:', error);
        throw error;
    }
}

module.exports = connectDb;

const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/mm')
  .then(() => console.log('Connected!'));
const userSchema  = new mongoose.Schema({
    name : {
        type : string,
        require : true
    },
    
})
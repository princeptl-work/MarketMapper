const mongoose = require("mongoose");
const reportSchema = new mongoose.Schema({
  data : Object
});
module.exports = mongoose.model("Report", reportSchema);

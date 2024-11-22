require("dotenv").config();
const { Storage } = require("@google-cloud/storage");

async function uploadFile(bucketName, file, fileOutputName) {
  try {
    const projectId = process.env.PROJECT_ID;
    const keyFilename = process.env.KEYFILENAME;
    const storage = new Storage({ projectId, keyFilename });

    const bucket = storage.bucket(bucketName);
    const res = await bucket.upload(file, {
      destination: fileOutputName,
    });
    return ret;
  } catch (error) {}
}

(async () => {
  const ret = await uploadFile(process.env.BUCKET_NAME, "../public/images");
  console.log(ret);
})();

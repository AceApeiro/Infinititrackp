function doPost(e) {
  var response = { status: 'error', message: 'Unknown error' };
  try {
    var data = JSON.parse(e.postData.contents);
    var targetSpreadsheetId = "1MaGvmF9o6Zh9p61ej7AR2MXyv6pZfkOLRtt08KAxpfU";
    var ss = SpreadsheetApp.openById(targetSpreadsheetId);
    
    // Get the specific LOGS sheet or default to the first one available
    var sheet = ss.getSheetByName("LOGS");
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }
    
    var timestamp = data.timestamp || new Date();
    var cso = data.cso || '';
    var csoName = data.csoName || '';
    var mainLocation = data.mainLocation || '';
    var subLocation = data.subLocation || '';
    var completedAmount = data.completedAmount || '';
    var geoCodeCompliance = data.geoCodeCompliance || '';
    var gDriveImageCode = data.imageUrl || data.driveImageUrl || data.proofImage || '';

    // Only upload file to drive if base64Image is passed
    if (data.base64Image) {
      try {
        // Option 1: Use root folder
        var folder = DriveApp.getRootFolder();
        
        // Option 2: Use specific folder ID (Replace with your actual Folder ID)
        // var folder = DriveApp.getFolderById("YOUR_FOLDER_ID_HERE"); 

        var blob = Utilities.newBlob(Utilities.base64Decode(data.base64Image), data.mimeType || 'image/jpeg', data.imageName || 'image.jpg');
        var file = folder.createFile(blob);
        // Ensure image can be viewed via Link
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        gDriveImageCode = file.getUrl();
      } catch (err) {
        gDriveImageCode = "Error uploading image: " + err.message;
      }
    }
    
    var rowData = [
      timestamp, 
      cso, 
      csoName, 
      mainLocation, 
      subLocation, 
      completedAmount, 
      geoCodeCompliance, 
      gDriveImageCode
    ];
    
    sheet.appendRow(rowData);
    
    response.status = "success";
    response.message = "Data saved to sheet";
    response.url = gDriveImageCode;

    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    response.message = error.toString();
    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  }
}

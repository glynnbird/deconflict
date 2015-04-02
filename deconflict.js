// thsis function takes the list of revisions and removes any deleted or not 'ok' ones.
// returns a flat array of document objects
var filterList = function(list,excluderev) {
  var retval = []
  for (var i in list) {
    if (list[i].ok && !list[i].ok._deleted) {
      if (!excluderev || (excluderev && list[i].ok._rev != excluderev)) {
        retval.push(list[i].ok);
      }
    }
  }
  return retval;
}

// convert the incoming array of document to an array of deletions - {_id:"x",_rev:"y",_deleted:true}
var convertToDeletions = function(list) {
  var retval = [];
  for (var i in list) {
    var obj = { _id:list[i]._id, _rev:list[i]._rev, _deleted: true };
    retval.push(obj);
  }
  return retval;
}

// copy the contents of object b into object a
var objmerge = function(a,b) {
  for (var i in b) {
    if (i != "_id" && i != "_rev") {
      a[i] = b[i];
    }
  }
  return a;
}

// In a database 'db' (a nano object), that has document with id 'docid', resolve the
// conflicts by choosing the revision with the highest field 'fieldname'.
var latestWins = function(db, docid, fieldname, callback) {
  
  // fetch the document with open_revs=all
  db.get(docid, {open_revs:'all'}, function(err, data) {
    
    // return if document isn't there
    if (err) {
      return callback("Document could not be fetched");
    }
    
    // remove 'deleted' leaf nodes from the list
    var doclist = filterList(data);
    
    // if the there is only <=1 revision left, the document is either deleted 
    // or not conflcited; either way, we're done
    if (doclist.length <= 1) {
      return callback("Document is not conflicted.");
    }
    
    // sort the array of documents by the supplied fieldname
    // our winner will be the last object in the sorted array
    doclist.sort(function(a, b ){ return a[fieldname]-b[fieldname]});
    var last=doclist.pop(); // remove the winning revision from the array
    
    // turn the remaining leaf nodes into deletions
    doclist = convertToDeletions(doclist);
    
    // now we can delete the unwanted revisions 
    db.bulk({docs: doclist}, callback);
    
  });
};

// In a database 'db' (a nano object), that has document with id 'docid', resolve the
// conflicts by merging all of the conflicting revisions together(!)
var merge = function(db, docid, callback) {
  var winner = null;
  
  // fetch the document to establish the current winning revision
  db.get(docid, function(err,data) {
    // return if document isn't there
    if (err) {
      return callback("Document could not be fetched");
    }
    winner = data;
    
    // fetch the document with open_revs=all
    db.get(docid, {open_revs:'all'}, function(err, data) {
    
      // remove 'deleted' leaf nodes from the list and the winning revision
      var doclist = filterList(data, winner._rev);
    
      // if the there is only <=1 revision left, the document  not conflcited
      if (doclist.length <= 1) {
        return callback("Document is not conflicted.");
      }
      
      // merge the losing revisions' contents into the winner's
      for(var i in doclist) {
        var loser = doclist[i];
        winner = objmerge(winner, loser);
      }
      
      // turn the losing leaf nodes into deletions
      doclist = convertToDeletions(doclist);
      
      // add our merged winners
      doclist.push(winner);
      
      // now we can deleted the unwanted revisions and create a new winner
      db.bulk({docs: doclist}, callback);
    });
  });  
};

// In a database 'db' (a nano object), that has document with id 'docid', resolve the
// conflicts by only keeping the nominated revision (rev)
var nominated = function(db, docid, rev, callback) {
  
  // fetch the document with open_revs=all
  db.get(docid, {open_revs:'all'}, function(err, data) {
  
    // remove 'deleted' leaf nodes from the list and the revision
    // we want to reamain as the winner
    var doclist = filterList(data, rev);
  
    // if the there is only <=1 revision left, the document is 
    // not conflcited and we don't need to do anything
    if (doclist.length <= 1) {
      return callback("Document is not conflicted.");
    }
    
    // turn the losing leaf nodes into deletions
    doclist = convertToDeletions(doclist);
    
    // now we can delete the unwanted revisions, which should leave our winner
    db.bulk({docs: doclist}, callback);
  });
};

module.exports = {
  latestWins: latestWins,
  merge: merge,
  nominated: nominated
}
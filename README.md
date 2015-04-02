# deconflict

This project contains some sample code that implements some common conflict resolution strategies for Apache CouchDB or Cloudant. A
documnet conflict arises when two copies of the same document are modified in different ways on disconnected nodes. When the nodes
reconnect (by replication or when a partitioned cluster re-forms), the document will enter a conflicted state.

We can see if a document is conflicted by fetching it with '?conflicts=true':

```
    > ccurl '/mydb/mydoc?conflicts=true'
    {
        "_id": "mydoc",
        "_rev": "1-fc889fbee9b50145576b35a8cbb05698",
        "ts": 1427969719,
        "specifier": "unfledgedness",
        "_conflicts": [
            "1-eacff04afc786360ce03dfff7e7d20e5",
            "1-d8e980e6163966216555c354173a156d",
            "1-bdd6ef2b4ab090a96c0fc67d7e150570",
            "1-bcc1bba0e894a9b674f106524355894f",
            "1-9aa17c34814cf64953a2696c75aa9450",
            "1-77193fb64b1dde0c2669b9dda4ce5e8b",
            "1-715f8b7d745dc90dd15c5514b3fd4deb",
            "1-2b3fcef8bcc3724d283e6c0da4a56304",
            "1-17b092a9f998e980bd19f53b4fe43c63"
        ]
    }
```

The above document is conflicted, because it has several revisions competing to be 'revision 1'. The algorithmically chosen winner (1-fc889fbee9b50145576b35a8cbb05698)
is the one that will be returned with a normal 'GET' request, but the conflicts will remain, occupying disk space and causing performance issues.

We can see the bodies of the conflicting documents by passing '?open_revs=all':

```
    > ccurl '/mydb/mydoc?open_revs=all'
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-fc889fbee9b50145576b35a8cbb05698","ts":1427969719,"specifier":"unfledgedness"}
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-eacff04afc786360ce03dfff7e7d20e5","ts":1427969711,"meatbird":"burrgrailer"}
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-d8e980e6163966216555c354173a156d","ts":1427969706,"Cycloidei":"overwhisper"}
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-bdd6ef2b4ab090a96c0fc67d7e150570","ts":1427969714,"leuk":"hypautomorphic"}
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-bcc1bba0e894a9b674f106524355894f","ts":1427969721,"undertruss":"reimpart"}
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-9aa17c34814cf64953a2696c75aa9450","ts":1427969713,"glazing":"prepotently"}
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-77193fb64b1dde0c2669b9dda4ce5e8b","ts":1427969708,"perivitelline":"hyalophagia"}
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-715f8b7d745dc90dd15c5514b3fd4deb","ts":1427969710,"Beltane":"bestrewment"}
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-2b3fcef8bcc3724d283e6c0da4a56304","ts":1427969717,"uta":"weightlessness"}
    --09c58c2442e8f93339da9ba7e2d24a16
    Content-Type: application/json
    
    {"_id":"mydoc","_rev":"1-17b092a9f998e980bd19f53b4fe43c63","ts":1427969716,"Baalite":"unrelentingly"}
    --09c58c2442e8f93339da9ba7e2d24a16--
```

You can see we have several document bodies with differing timestamps (ts) and different key/value pairs. As the '_rev' is a calculated
hash of the document's body, it too varies per document.

## Conflict resolution strategies

In order to fix the problem and force a document to have no conflicts, we need to

* delete the unwanted document revisions
* either leave one revision untouched, or post a new winning revision

It is up to our application to resolve the conflicts; the database can't do it for you because you may wish to

* keep the revision with most recent timestamp
* merge the conflicting documents into one
* only keep a nominated revision number (chosen by a human, for example)

deconflict.js contains three functions which remove conflicts on the above three conflict-resolution strategies.

In the detail below, we use the functions to clear conflicts in our `/mydb/mydoc` document which was created by running `./generateconflict.sh`.

## Strategy 1 - Keep the most recent revision

In our sample documents, we store a timestamp value (ts) in the document body. Ignoring the complexity of synchronising clocks
in distributed systems, we could chose to keep the revision with the greatest timestamp. The algorithm works like this:

* get a list of all conflicted documents
* sort the list by 'ts'
* remove the last element from the list (the winner)
* delete all of the remaining revisions, leaving the winner
  
```
    var db = nano.db.use('mydb');
    deconflict.latestWins(db, 'mydoc', 'ts', function(err,data) {
      console.log(err,data);
    });
```

## Strategy 2 - Merge all revisions

Our sample documents also have different key/value paris in the body. If we want to keep all of the data, then we can merge 
all of the keys into existing winning revision, with the obvious side effect that if your documents share key names, then data 
will be overwritten. The algorithm works like this:

* get the winning revision
* get a list of all conflicted documents
* remove the winning revision from the list
* copy each list item's keys into the winning document
* delete all the losing revisions
* write the winning revision

```
    var db = nano.db.use('mydb');
    deconflict.merge(db, 'mydoc', function(err,data) {
      console.log(err,data);
    });
```

## Stategy 3 - Nominated revision

If we know which revision we wish to keep, then we simply have to delete the others:

* get a list of all conflicted documents
* remove the winning revision from the list
* delete all the losing revisions

```
    var db = nano.db.use('mydb');
    deconflict.nominated(db, 'mydoc', '1-2b3fcef8bcc3724d283e6c0da4a56304', function(err,data) {
      console.log(err,data);
    });
```

## Which strategy should I use?

It depends on your application! The 'merge' option is unlikely to be useful in its present form but it would simple enough to devise 
a more nuanced algorithm that only merged keys what were missing in the winner, for example. 

You may wish to look at data models that would avoid conflicts altogether, such as a 'write-only' pattern.

## Further reading

* [Introduction to document conflicts - Part one](https://cloudant.com/blog/introduction-to-document-conflicts-part-one/) 
* [Introduction to document conflicts - Part two](https://cloudant.com/blog/introduction-to-document-conflicts-part-two/) 
* [Introduction to document conflicts - Part three](https://cloudant.com/blog/introduction-to-document-conflicts-part-three/) 

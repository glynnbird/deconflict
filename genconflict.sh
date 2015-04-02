#!/bin/bash
DEST="mydb"
DOC="mydoc"
 
# create destination database
ccurl -X DELETE "/$DEST"
ccurl -X PUT "/$DEST"
 
# loop 1-->10
for i in `seq 1 10`; do
  KEY1=`perl -e 'open IN, "</usr/share/dict/words";rand($.) < 1 && ($n=$_) while <IN>;print $n'`
  KEY2=`perl -e 'open IN, "</usr/share/dict/words";rand($.) < 1 && ($n=$_) while <IN>;print $n'`
  DB="db$i"
  TS=`date +%s`
  json="{ \"_id\": \"$DOC\",  \"ts\": $TS, \"$KEY1\": \"$KEY2\" }"
  echo "Creating database $DB with single doc $json"
  
  # create a database e.g. DB1
  ccurl -X PUT "/$DB"
  
  # put a document in it e.g. { "_id": "mydoc", "ts": 42 }
  ccurl -X POST -d "$json" "/$DB"
  
  # replicate this database to mydb
  repl="{ \"source\": \"$DB\", \"target\": \"mydb\" }"
  echo "Replicating to $DEST"
  ccurl -X POST -d "$repl" "/_replicator"
  sleep 1
done
 
# let replication complete
sleep 5

# loop 1-->10
for i in `seq 1 10`; do
  DB="db$i"
  # delete a database e.g. DB1
  echo "Deleting $DB"
  ccurl -X DELETE "/$DB"
done
 
# read back our conflicted document /mydb/mydoc
ccurl "/$DEST/$DOC?conflicts=true"


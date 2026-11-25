"""Repeatable tests for the local encoder, spend guard, integrity and retry flow."""
import base64
from contextlib import redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import ModuleType
import unittest
from unittest.mock import patch

import ingest

class Error(Exception):
    def __init__(self,code):
        self.response={"Error":{"Code":code}}

class Bucket:
    def __init__(self):
        self.objects={}
        self.writes=[]
        self.fail_once=None

    def head_object(self,Bucket,Key):
        if Key not in self.objects:
            raise Error("404")
        data,meta=self.objects[Key]
        return {"ContentLength":len(data),"Metadata":meta,"ETag":'"'+hashlib.md5(data,usedforsecurity=False).hexdigest()+'"'}

    def put_object(self,Key,Body,ContentMD5,Metadata,IfNoneMatch,**kwargs):
        if self.fail_once and Key.endswith(self.fail_once):
            self.fail_once=None
            raise Error("ServiceUnavailable")
        if IfNoneMatch!="*" or Key in self.objects:
            raise Error("PreconditionFailed")
        body=Body.read()
        if base64.b64encode(hashlib.md5(body,usedforsecurity=False).digest()).decode()!=ContentMD5:
            raise Error("BadDigest")
        self.objects[Key]=(body,Metadata)
        self.writes.append(Key)

class IngestionTests(unittest.TestCase):
    def test_budget(self):
        plan=ingest.estimated_plan(5400,[360,480,720],10,0,10,100,20)
        self.assertAlmostEqual(plan["estimated_total_GB_including_existing"],57.9874,places=4)
        self.assertEqual(plan["storage_alerts_crossed_percent"],[70,85,95])
        self.assertEqual(plan["peak_one_hour"][-1]["segment_requests"],180000)

    def test_names(self):
        for name in ("../seg-1.ts","captions/../../../private.vtt","720p/../private.ts","C:/master.m3u8"):
            self.assertFalse(ingest.safe_key(name))
        self.assertTrue(ingest.safe_key("captions/en-GB.vtt"))
        self.assertTrue(ingest.safe_key("720p/seg-00013.ts"))

    def test_encode_budget_dry_run_integrity_and_retry(self):
        with tempfile.TemporaryDirectory() as temp,redirect_stdout(io.StringIO()):
            base=Path(temp)
            src=base/"input.mp4"
            subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-f","lavfi","-i",
                "color=blue:size=640x360:rate=24:duration=7","-threads","1","-c:v","libx264",str(src)],check=True)
            tracks=base/"caption.vtt"
            tracks.write_text("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nAn example caption.\n")
            self.assertEqual(ingest.main(["encode",str(src),"--out",str(base/"encoded"),"--renditions","360",
                "--segment","6","--caption",f"en={tracks}"]),0)
            asset,=(base/"encoded").iterdir()
            self.assertTrue((asset/"360p/seg-00001.ts").exists())
            self.assertIn("#EXT-X-ENDLIST",(asset/"360p/index.m3u8").read_text())
            args=["upload",str(asset),"--used-gb","0"]
            self.assertEqual(ingest.main(args),0)
            self.assertEqual(ingest.main([*args,"--limit-gb","0.0000001"]),1)
            bucket=Bucket()
            fake=ModuleType("boto3")
            fake.client=lambda *args,**kwargs:bucket
            config=ModuleType("botocore.config")
            config.Config=lambda **kwargs:kwargs
            exceptions=ModuleType("botocore.exceptions")
            exceptions.ClientError=Error
            modules={"boto3":fake,"botocore":ModuleType("botocore"),"botocore.config":config,"botocore.exceptions":exceptions}
            environment={"R2_ACCOUNT_ID":"0"*32,"R2_BUCKET_NAME":"test-bucket","R2_ACCESS_KEY_ID":"test","R2_SECRET_ACCESS_KEY":"test"}
            with patch.dict(sys.modules,modules),patch.dict(os.environ,environment):
                bucket.fail_once="360p/index.m3u8"
                with self.assertRaises(Error):
                    ingest.main([*args,"--apply"])
                self.assertEqual(json.loads((asset/"upload-status.json").read_text())["status"],"failed")
                self.assertTrue(bucket.writes)
                self.assertFalse(any(key.endswith("/master.m3u8") for key in bucket.writes))
                self.assertEqual(ingest.main([*args,"--apply"]),0)
                self.assertEqual(bucket.writes[-1],f"{asset.name}/master.m3u8")
                self.assertEqual(len(bucket.writes),len(set(bucket.writes)))
                writes_so_far=list(bucket.writes)
                self.assertEqual(ingest.main([*args,"--apply"]),0)
                self.assertEqual(writes_so_far,bucket.writes)
                first=next(iter(bucket.objects))
                prior,metadata=bucket.objects[first]
                bucket.objects[first]=(prior+b"modified",metadata)
                self.assertEqual(ingest.main([*args,"--apply"]),1)
                self.assertEqual(writes_so_far,bucket.writes)
            # Changing a local output makes even a credential-free dry run stop.
            (asset/"captions/en.vtt").write_text("WEBVTT\n\nModified.")
            self.assertEqual(ingest.main(args),1)

if __name__=="__main__":
    unittest.main()

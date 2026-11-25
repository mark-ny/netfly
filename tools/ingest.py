#!/usr/bin/env python3
"""Inspect, encode, and upload a versioned private HLS asset. Python 3.10+."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import uuid

# Decimal kbit/s for the target video bitrate. Each rendition includes its own audio.
VIDEO_KBPS = {360: 600, 480: 1000, 720: 2200, 1080: 3400}
AUDIO_KBPS = 96
MIME = {".ts": "video/mp2t", ".m3u8": "application/vnd.apple.mpegurl",
        ".webp": "image/webp", ".vtt": "text/vtt; charset=utf-8"}
INPUT_TYPES = {".mp4", ".m4v", ".mov", ".mkv", ".webm"}
BASE_OVERHEAD = 1.05
MAX_FILE = 80_000_000_000
ROOT_FILES = {"master.m3u8","thumbnail.webp"}
REQUIRED_META = "asset.json"

def now():
    return datetime.now(timezone.utc).isoformat()

def require(ok, message):
    if not ok:
        raise ValueError(message)

def positive_float(raw):
    value = float(raw)
    require(math.isfinite(value) and value >= 0, "Expected a finite, nonnegative number")
    return value

def renditions(raw):
    try:
        values = sorted({int(v) for v in raw.split(",")})
    except ValueError:
        raise argparse.ArgumentTypeError("Use comma-separated heights, e.g. 360,480,720") from None
    if not values or any(v not in VIDEO_KBPS for v in values):
        raise argparse.ArgumentTypeError("Supported heights: 360,480,720,1080")
    return values

def fingerprints(path):
    sha = hashlib.sha256()
    md5 = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as src:
        for chunk in iter(lambda: src.read(1024*1024), b""):
            sha.update(chunk)
            md5.update(chunk)
    return sha.hexdigest(), base64.b64encode(md5.digest()).decode("ascii")

def inspect(path):
    require(path.is_file() and path.suffix.lower() in INPUT_TYPES, "Provide a local MP4, MOV, M4V, MKV or WebM file")
    require(0 < path.stat().st_size <= MAX_FILE, "Input is empty or exceeds the 80 GB validation limit")
    result = subprocess.run(["ffprobe","-v","error","-protocol_whitelist","file",
          "-format_whitelist","mov,matroska,webm","-show_streams","-show_format","-of","json",str(path.resolve())],
          capture_output=True, text=True, check=True, timeout=60)
    info = json.loads(result.stdout)
    duration = float(info["format"].get("duration",0))
    require(0 < duration <= 8*3600 and math.isfinite(duration), "Expected media up to eight hours long")
    video = next((s for s in info["streams"] if s["codec_type"]=="video" and not s.get("disposition",{}).get("attached_pic")),None)
    require(video and 0 < video["width"] <= 8192 and 0 < video["height"] <= 8192, "No supported video stream")
    return {"duration":duration,"height":video["height"], "stream":video["index"],
            "audio":any(s["codec_type"]=="audio" for s in info["streams"])}

def thresholds(raw):
    try:
        values = sorted({int(v) for v in raw.split(",")})
    except ValueError:
        raise argparse.ArgumentTypeError("Use comma-separated integer percentages") from None
    if not values or min(values) < 1 or max(values) > 100:
        raise argparse.ArgumentTypeError("Set warning percentages between 1 and 100")
    return values

def estimated_plan(seconds, heights, segment, used, allowance, hours, count, warn_at=(70,85,95)):
    require(seconds>0 and allowance>0 and count>=1, "Duration, storage limit and film count must be positive")
    bitrate = sum(VIDEO_KBPS[h] + AUDIO_KBPS for h in heights)
    one_gb = seconds*bitrate*1000/8 * BASE_OVERHEAD / 1e9 + .002
    total = used + one_gb*count
    percentage = total / allowance * 100
    # One authorization + two playlists per viewing hour is a stated model assumption.
    segment_reads = math.ceil(3600/segment)*hours
    worker_requests = segment_reads + (3+80)*hours
    writes_per_upload = count*(math.ceil(seconds/segment)*len(heights)+len(heights)+3)
    return {"assumptions":{"segment_seconds":segment,"encoded_audio_kbps_per_rendition":AUDIO_KBPS,
        "container_multiplier":BASE_OVERHEAD,"additional_art_and_captions_MB":2,"films":count,
        "monthly_viewer_hours":hours,"GB":"decimal billion bytes","allowance_GB":allowance},
        "estimated_GB_per_film":round(one_gb,5),"estimated_total_GB_including_existing":round(total,5),
        "estimated_storage_percent":round(percentage,1),"storage_alerts_crossed_percent":[q for q in warn_at if percentage>=q],
        "estimated_upload_class_A_objects":writes_per_upload,"estimated_origin_reads_without_edge_cache":segment_reads+2*hours,
        "estimated_monthly_worker_requests":worker_requests,"estimated_progress_writes_30s":hours*120,
        "estimated_delivery_GB_at_lowest_rendition":round(hours*3600*(VIDEO_KBPS[min(heights)]+AUDIO_KBPS)*1000/8*BASE_OVERHEAD/1e9,3),
        "estimated_baseline_R2_USD_per_month_excluding_taxes":round(max(0,math.ceil(total)-10)*.015+
             max(0,math.ceil(writes_per_upload/1e6)-1)*4.5 +
             max(0,math.ceil((segment_reads+2*hours+2*writes_per_upload)/1e6)-10)*.36,4),
        "peak_one_hour":[{"concurrent_viewers":n,"segment_requests":math.ceil(3600/segment)*n,
                "worker_requests_with_startup_and_renewal":n*(math.ceil(3600/segment)+3+80),
                "progress_writes_30s":n*120} for n in (100,200,500)]}

def safe_key(rel):
    return (rel in ROOT_FILES or re.fullmatch(r"(?:360|480|720|1080)p/(?:index\.m3u8|seg-[0-9]{5,6}\.ts)",rel)
            or re.fullmatch(r"captions/[a-z]{2,3}(?:-[A-Z]{2})?\.vtt",rel))

def collect(root):
    result = {}
    for p in sorted(root.rglob("*")):
        require(not p.is_symlink(), "Symlinks are unsupported")
        if p.is_file() and p.name not in {REQUIRED_META,"upload-status.json"}:
            rel=p.relative_to(root).as_posix()
            require(safe_key(rel),f"Unexpected output file {rel}")
            sha,md5=fingerprints(p)
            result[rel]={"sha256":sha,"md5":md5,"bytes":p.stat().st_size}
    return result

def write_json(path,data):
    with tempfile.NamedTemporaryFile(mode="w",encoding="utf-8",dir=path.parent,delete=False) as dest:
        json.dump(data,dest,indent=2)
        temporary=Path(dest.name)
    temporary.replace(path)

def add_captions(root, tracks):
    for spec in tracks:
        lang,sep,name=spec.partition("=")
        require(sep and re.fullmatch(r"[a-z]{2,3}(?:-[A-Z]{2})?",lang),"Caption syntax: en=/path/to/captions.vtt")
        path=Path(name)
        require(path.suffix.lower()==".vtt" and path.is_file() and path.stat().st_size<=2_000_000,"Invalid WebVTT file")
        data=path.read_text(encoding="utf-8-sig")
        require(re.match(r"^WEBVTT(?:[ \t][^\n]*)?\r?\n",data) and "\x00" not in data and "-->" in data,"Invalid WebVTT header or cues")
        folder=root/"captions"
        folder.mkdir(exist_ok=True)
        target=folder/(lang+".vtt")
        require(not target.exists(),"Duplicate subtitle language")
        target.write_text(data,encoding="utf-8")

def encode(args, info):
    source=args.source.resolve()
    parent=args.out.resolve()
    parent.mkdir(parents=True,exist_ok=True)
    asset_id=str(uuid.uuid4())
    heights=args.renditions
    require(max(heights)<=info["height"],"Select renditions at or below source height")
    plan=estimated_plan(info["duration"],heights,args.segment,args.used_gb,args.limit_gb,args.viewer_hours,1,args.warn_at)
    print(json.dumps(plan,indent=2),flush=True)
    require(plan["estimated_total_GB_including_existing"]<args.limit_gb,"Estimate reaches the configured budget; select fewer renditions")
    require(shutil.disk_usage(parent).free>plan["estimated_GB_per_film"]*1.3e9,"Insufficient local space")
    with tempfile.TemporaryDirectory(dir=parent,prefix=".encode-") as temp:
        root=Path(temp)/asset_id
        root.mkdir()
        add_captions(root,args.caption)
        master=["#EXTM3U","#EXT-X-VERSION:6","#EXT-X-INDEPENDENT-SEGMENTS"]
        for h in heights:
            destination=root/f"{h}p"
            destination.mkdir()
            inp=["-protocol_whitelist","file","-format_whitelist","mov,matroska,webm","-i",str(source)]
            if not info["audio"]:
                inp+=["-f","lavfi","-i","anullsrc=r=48000:cl=stereo"]
            video_rate=VIDEO_KBPS[h]
            cmd=["ffmpeg","-hide_banner","-nostats","-loglevel","error","-progress","pipe:1",
                 "-threads","2",*inp,"-map",f"0:{info['stream']}","-map","0:a:0" if info["audio"] else "1:a:0",
                 "-map_metadata","-1","-t",str(info["duration"]),"-vf",f"scale=-2:{h},setsar=1,format=yuv420p",
                 "-fps_mode","cfr","-r","24","-threads","2","-c:v","libx264","-profile:v","main",
                 "-preset","fast","-b:v",f"{video_rate}k","-maxrate",f"{int(video_rate*1.1)}k",
                 "-bufsize",f"{video_rate*2}k","-sc_threshold","0","-g",str(args.segment*24),
                 "-keyint_min",str(args.segment*24),"-force_key_frames",f"expr:gte(t,n_forced*{args.segment})",
                 "-c:a","aac","-b:a",f"{AUDIO_KBPS}k","-ac","2","-ar","48000","-f","hls",
                 "-hls_time",str(args.segment),"-hls_playlist_type","vod","-hls_flags","independent_segments",
                 "-hls_segment_filename","seg-%05d.ts","index.m3u8"]
            with subprocess.Popen(cmd,stdout=subprocess.PIPE,text=True,cwd=destination) as job:
                last=-1
                for line in job.stdout:
                    if line.startswith("out_time_us="):
                        try: bucket=min(10,int(float(line.split("=")[1])/1e6/info["duration"]*10))
                        except ValueError: continue
                        if bucket>last:
                            print(f"{h}p: {bucket*10}% encoded",flush=True)
                            last=bucket
                require(job.wait()==0,f"FFmpeg failed encoding {h}p")
            playlist=(destination/"index.m3u8").read_text()
            require("#EXT-X-ENDLIST" in playlist,"Missing VOD end marker")
            segments=re.findall(r"#EXTINF:([\d.]+).*\n(seg-\d+\.ts)",playlist)
            require(bool(segments),"No transport segments created")
            peak=math.ceil(max((destination/name).stat().st_size*8/float(d) for d,name in segments))
            meta=subprocess.check_output(["ffprobe","-v","error","-select_streams","v:0",
                "-show_entries","stream=width,height","-of","json",str(destination/segments[0][1])],text=True)
            decoded=json.loads(meta)["streams"][0]
            master.extend([f"#EXT-X-STREAM-INF:BANDWIDTH={peak},RESOLUTION={decoded['width']}x{decoded['height']},FRAME-RATE=24.000",f"{h}p/index.m3u8"])
        (root/"master.m3u8").write_text("\n".join(master)+"\n")
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-ss",str(min(8,info["duration"]/4)),
            "-protocol_whitelist","file","-format_whitelist","mov,matroska,webm","-i",str(source),
            "-map",f"0:{info['stream']}","-frames:v","1","-vf","scale=640:-2","-c:v","libwebp",
            "-threads","1",str(root/"thumbnail.webp")],check=True)
        manifest={"asset_id":asset_id,"created_at":now(),"duration_seconds":info["duration"],
                  "renditions":heights,"segment_seconds":args.segment,"files":collect(root)}
        write_json(root/REQUIRED_META,manifest)
        root.rename(parent/asset_id)
        print(f"Encoded asset: {parent/asset_id}")

def upload(args):
    root=args.asset.resolve()
    meta=json.loads((root/REQUIRED_META).read_text())
    asset_id=str(uuid.UUID(meta["asset_id"]))
    require(root.name==asset_id,"Directory name must match asset UUID")
    files=collect(root)
    require(files==meta["files"] and "master.m3u8" in files,"Files differ from the encoding inventory")
    actual_gb=sum(item["bytes"] for item in files.values())/1e9
    plan=estimated_plan(meta["duration_seconds"],meta["renditions"],meta["segment_seconds"],
        args.used_gb,args.limit_gb,args.viewer_hours,1,args.warn_at)
    plan.update({"actual_asset_GB":round(actual_gb,7),"actual_objects":len(files),"prefix":asset_id,
        "estimated_total_after_upload_GB":round(args.used_gb+actual_gb,7),"estimated_head_checks_max":len(files)*2})
    print(json.dumps(plan,indent=2),flush=True)
    require(actual_gb+args.used_gb<args.limit_gb,"Upload would reach the configured storage budget")
    if not args.apply:
        print("Dry run complete. Use --apply to upload this asset.")
        return
    try:
        import boto3
        from botocore.config import Config
        from botocore.exceptions import ClientError
    except ImportError as exc:
        raise ValueError("Install tools/requirements.txt to upload") from exc
    account=os.environ.get("R2_ACCOUNT_ID","")
    require(re.fullmatch("[a-fA-F0-9]{32}",account),"Invalid R2_ACCOUNT_ID")
    bucket=os.environ.get("R2_BUCKET_NAME","")
    require(re.fullmatch("[a-z0-9][a-z0-9-]{1,61}[a-z0-9]",bucket),"Invalid R2_BUCKET_NAME")
    client=boto3.client("s3",region_name="auto",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(retries={"mode":"standard","total_max_attempts":5},connect_timeout=10,read_timeout=60,
                      request_checksum_calculation="when_required",response_checksum_validation="when_required"))
    ordered=sorted(files,key=lambda name:(int(name=="master.m3u8"),int(name.endswith(".m3u8")),name))
    state={"asset_id":asset_id,"status":"uploading","verified":0,"total":len(ordered)}
    status=root/"upload-status.json"
    write_json(status,state)
    try:
        for index,name in enumerate(ordered,1):
            item=files[name]
            key=f"{asset_id}/{name}"
            operation={"Bucket":bucket,"Key":key}
            try:
                remote=client.head_object(**operation)
            except ClientError as exc:
                if exc.response["Error"]["Code"] not in {"404","NotFound","NoSuchKey"}: raise
                remote=None
            if remote is None:
                with (root/name).open("rb") as body:
                    client.put_object(**operation,Body=body,ContentLength=item["bytes"],ContentMD5=item["md5"],
                        Metadata={"sha256":item["sha256"]},ContentType=MIME[Path(name).suffix],
                        CacheControl="private, no-store",IfNoneMatch="*")
                remote=client.head_object(**operation)
            checksum=base64.b64decode(item["md5"]).hex()
            require(remote["ContentLength"]==item["bytes"] and remote["Metadata"].get("sha256")==item["sha256"]
                    and remote.get("ETag","").strip('"')==checksum,f"Integrity conflict: {name}; existing asset preserved")
            state.update(verified=index,updated_at=now())
            write_json(status,state)
            print(f"Verified {index}/{len(ordered)}: {name}",flush=True)
        state["status"]="ready"
    except Exception:
        state["status"]="failed"
        raise
    finally:
        write_json(status,state)
    print(f"Register video_assets.prefix = {asset_id}. Caption paths are relative to this prefix.")

def budgets(cmd):
    cmd.add_argument("--warn-at",type=thresholds,default=[70,85,95],help="Comma-separated storage warning percentages")
    cmd.add_argument("--used-gb",type=positive_float,default=0,
        help="Current R2 storage in decimal GB. Required explicitly for upload.")
    cmd.add_argument("--limit-gb",type=positive_float,default=10)
    cmd.add_argument("--viewer-hours",type=positive_float,default=100)

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest="action",required=True)
    plan=commands.add_parser("plan",help="Estimate storage, requests and cost before encoding")
    choose=plan.add_mutually_exclusive_group(required=True)
    choose.add_argument("--minutes",type=positive_float)
    choose.add_argument("--source",type=Path)
    plan.add_argument("--count",type=int,default=1)
    encode_cli=commands.add_parser("encode",help="Create a new, local immutable HLS asset")
    encode_cli.add_argument("source",type=Path)
    encode_cli.add_argument("--out",type=Path,default=Path("encoded"))
    encode_cli.add_argument("--caption",action="append",default=[],metavar="LANG=PATH")
    for cmd in (plan,encode_cli):
        cmd.add_argument("--renditions",type=renditions,default=[360,480,720])
        cmd.add_argument("--segment",type=int,choices=[6,8,10,12],default=6)
        budgets(cmd)
    upload_cli=commands.add_parser("upload",help="Validate or upload one completed asset to private R2")
    upload_cli.add_argument("asset",type=Path)
    upload_cli.add_argument("--apply",action="store_true")
    budgets(upload_cli)
    upload_cli.set_defaults(used_gb=None)
    args=parser.parse_args(argv)
    try:
        if args.action=="upload":
            require(args.used_gb is not None,"Pass --used-gb from current provider measurements")
            upload(args)
        elif args.action=="plan":
            seconds=inspect(args.source)["duration"] if args.source else args.minutes*60
            print(json.dumps(estimated_plan(seconds,args.renditions,args.segment,args.used_gb,args.limit_gb,args.viewer_hours,args.count,args.warn_at),indent=2))
        else:
            encode(args,inspect(args.source))
        return 0
    except (ValueError,KeyError,OSError,subprocess.SubprocessError) as exc:
        print(f"Ingestion stopped: {exc}",file=sys.stderr)
        return 1

if __name__=="__main__":
    raise SystemExit(main())

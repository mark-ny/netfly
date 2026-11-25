import {mkdir} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {resolve,dirname} from 'node:path'
const target=resolve(process.argv[2]||'dist/downloads/stillframe-source.zip')
await mkdir(dirname(target),{recursive:true})
execFileSync('git',['archive','--format=zip','--prefix=stillframe/','--output='+target,'HEAD'])
console.log('Created '+target)


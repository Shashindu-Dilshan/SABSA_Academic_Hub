import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase.js'
import { uploadToGoogleDrive } from './lib/googleDrive.js'

const BUCKET = 'wall-uploads'
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const LIBRARY_DEGREES = ['Applied Accounting', 'Business Analytics']

const LIBRARY_YEARS = [1, 2, 3, 4]

const LIBRARY_SEMESTERS = [
  { value: 1, label: 'Semester 1', year: 1 },
  { value: 2, label: 'Semester 2', year: 1 },
  { value: 3, label: 'Semester 3', year: 2 },
  { value: 4, label: 'Semester 4', year: 2 },
  { value: 5, label: 'Semester 5', year: 3 },
  { value: 6, label: 'Semester 6', year: 3 },
  { value: 7, label: 'Semester 7', year: 4 },
  { value: 8, label: 'Semester 8', year: 4 },
]

const LIBRARY_RESOURCE_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'Lecture Notes', label: 'Lecture Notes' },
  { value: 'PDF', label: 'PDF' },
  { value: 'Presentation', label: 'Presentations' },
  { value: 'Past Paper', label: 'Past Papers' },
  { value: 'Video', label: 'Videos' },
  { value: 'Other Resource', label: 'Other Resources' },
]

const LIBRARY_RESOURCE_FORM_DEFAULTS = {
  title: '',
  description: '',
  resource_type: 'Lecture Notes',
  external_url: '',
  is_published: false,
}

function getDriveStorageProvider(url) {
  let parsedUrl

  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('Enter a valid Google Drive or OneDrive sharing URL.')
  }

  const hostname = parsedUrl.hostname.toLowerCase()
  const isGoogleDrive =
    hostname === 'drive.google.com' || hostname === 'docs.google.com'
  const isOneDrive =
    hostname === 'onedrive.live.com' ||
    hostname === '1drv.ms' ||
    hostname.endsWith('.sharepoint.com')

  if (parsedUrl.protocol !== 'https:' || (!isGoogleDrive && !isOneDrive)) {
    throw new Error('Use a secure Google Drive or OneDrive sharing URL.')
  }

  return isGoogleDrive ? 'google_drive' : 'onedrive'
}

function getStoredResourceProvider(resource) {
  try {
    return getDriveStorageProvider(resource.external_url)
  } catch {
    return resource.storage_provider
  }
}

function getStoredResourceProviderLabel(resource) {
  const provider = getStoredResourceProvider(resource)

  if (provider === 'google_drive') return 'Google Drive'
  if (provider === 'onedrive') return 'OneDrive'
  return 'an external provider'
}

// Temporary examples only. Replace these with the official module list.
const LIBRARY_DEMO_MODULES = [
  {
    id: 'demo-1',
    title: 'Module details to be added',
    code: 'Module 01',
    resources: [],
  },
  {
    id: 'demo-2',
    title: 'Module details to be added',
    code: 'Module 02',
    resources: [],
  },
  {
    id: 'demo-3',
    title: 'Module details to be added',
    code: 'Module 03',
    resources: [],
  },
]

function Icon({ name, size = 20, fill = 'none' }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill, stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>
  if (name === 'heart') return <svg {...common}><path d="M20.8 8.6c0 4.2-8.8 10-8.8 10s-8.8-5.8-8.8-10A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.8 2.2Z"/></svg>
  if (name === 'paperclip') return <svg {...common}><path d="m8.5 12.5 6.8-6.8a3.2 3.2 0 0 1 4.5 4.5l-9.2 9.2a5 5 0 0 1-7.1-7.1l9-9"/></svg>
  if (name === 'close') return <svg {...common}><path d="m18 6-12 12M6 6l12 12"/></svg>
  if (name === 'shield') return <svg {...common}><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg>
  if (name === 'logout') return <svg {...common}><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>
  return null
}

function relativeDate(value) {
  const date = new Date(value)
  const elapsed = Math.max(0, Date.now() - date.getTime())
  const hours = Math.floor(elapsed / 3_600_000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S'
}

function Attachment({ path, signedUrl, error }) {
  const [imageUnavailable, setImageUnavailable] = useState(false)

  useEffect(() => {
    setImageUnavailable(false)
  }, [signedUrl])

  if (!path) return null
  const isImage = /\.(jpe?g|png|webp)$/i.test(path)
  if (!signedUrl || imageUnavailable) return <div className="attachment-unavailable"><Icon name="paperclip" size={17}/><span>{isImage ? 'Image preview unavailable' : 'Attachment unavailable'}</span>{error && <small>{error}</small>}</div>
  return isImage
    ? <a className="attachment-image" href={signedUrl} target="_blank" rel="noreferrer"><img src={signedUrl} alt="Post attachment" loading="lazy" onError={() => setImageUnavailable(true)}/></a>
    : <a className="attachment-file" href={signedUrl} target="_blank" rel="noreferrer"><Icon name="paperclip" size={18}/><span>{path.split('/').at(-1)}</span><span className="file-open">Open ↗</span></a>
}

export default function App() {
  const [activePage, setActivePage] = useState('wall')
  // Academic Library navigation and filters
const [libraryDegree, setLibraryDegree] = useState('Applied Accounting')
const [libraryYear, setLibraryYear] = useState(1)
const [librarySemester, setLibrarySemester] = useState(1)
const [librarySearch, setLibrarySearch] = useState('')
const [libraryResourceType, setLibraryResourceType] = useState('all')
const [selectedLibraryModule, setSelectedLibraryModule] = useState(null)
  const [posts, setPosts] = useState([])
  const [likes, setLikes] = useState([])
  const [visitorId, setVisitorId] = useState('')
  const [query, setQuery] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [form, setForm] = useState({ name: '', batch: '', content: '', isAnonymous: false })
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [adminOpen, setAdminOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [isCommittee, setIsCommittee] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)
  const [signedFiles, setSignedFiles] = useState({})
  const [attachmentErrors, setAttachmentErrors] = useState({})
  const [decisionFeedback, setDecisionFeedback] = useState({})

  const [announcements, setAnnouncements] = useState([])
  const [libraryModules, setLibraryModules] = useState([])

const [examPapers, setExamPapers] = useState([])
const [examsLoading, setExamsLoading] = useState(false)
const [examSearch, setExamSearch] = useState('')
const [examDegree, setExamDegree] = useState('All')
const [examStudyYear, setExamStudyYear] = useState('All')
const [examSemester, setExamSemester] = useState('All')
const [examYear, setExamYear] = useState('All')
const [examPaperType, setExamPaperType] = useState('All')
const [examFormOpen, setExamFormOpen] = useState(false)
const [editingExamPaper, setEditingExamPaper] = useState(null)
const [examForm, setExamForm] = useState({
  degree: 'Applied Accounting',
  year_of_study: 1,
  semester: 1,
  module_code: '',
  module_name: '',
  exam_year: new Date().getFullYear(),
  paper_type: 'Final Exam',
  title: '',
  description: '',
  file_url: '',
  is_published: false,
})

  const [libraryResources, setLibraryResources] = useState([])
const [libraryLoading, setLibraryLoading] = useState(false)
const [libraryFormOpen, setLibraryFormOpen] = useState(false)
const [editingLibraryModule, setEditingLibraryModule] = useState(null)
const [librarySaving, setLibrarySaving] = useState(false)
const [libraryResourceFormOpen, setLibraryResourceFormOpen] = useState(false)
const [editingLibraryResource, setEditingLibraryResource] = useState(null)
const [libraryResourceUpdating, setLibraryResourceUpdating] = useState(false)
const [libraryResourceSaving, setLibraryResourceSaving] = useState(false)
const [libraryResourceMode, setLibraryResourceMode] = useState('upload')
const [libraryResourceFile, setLibraryResourceFile] = useState(null)

const [libraryResourceForm, setLibraryResourceForm] = useState(
  LIBRARY_RESOURCE_FORM_DEFAULTS
)

const [libraryModuleForm, setLibraryModuleForm] = useState({
  degree: 'Applied Accounting',
  year_of_study: 1,
  semester: 1,
  module_code: '',
  module_name: '',
  description: '',
  is_published: false,
})
  const [announcementLoading, setAnnouncementLoading] = useState(false)
  const [announcementSearch, setAnnouncementSearch] = useState('')
  const [announcementCategory, setAnnouncementCategory] = useState('All')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)

  const [announcementFormOpen, setAnnouncementFormOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [announcementSaving, setAnnouncementSaving] = useState(false)

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    summary: '',
    content: '',
    category: 'General',
    is_published: false,
  })

  const loadSignedFiles = useCallback(async (paths) => {
    const uniquePaths = [...new Set(paths.filter(Boolean))]
    if (!uniquePaths.length) return { urls: {}, errors: {} }

    const signedResults = await Promise.all(uniquePaths.map(async (path) => {
      const { data, error: signingError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
      return { path, signedUrl: data?.signedUrl || '', error: signingError?.message || '' }
    }))
    const failures = signedResults.filter(({ error: signingError }) => signingError)
    if (failures.length) setError('Some attachments could not load. Confirm the private storage read policy is installed, then refresh.')

    return {
      urls: Object.fromEntries(signedResults.map(({ path, signedUrl }) => [path, signedUrl])),
      errors: Object.fromEntries(signedResults.filter(({ error: signingError }) => signingError).map(({ path, error: signingError }) => [path, signingError])),
    }
  }, [])

  const loadFeed = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase.from('wall_public_posts')
      .select('id,name,batch,content,attachment_path,created_at,published_at,is_anonymous')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(100)
    if (fetchError) setError(`${fetchError.message} Run the updated Supabase SQL before loading the wall.`)
    else {
      setPosts(data ?? [])
      if (data?.length) {
        const { data: likeRows, error: likeError } = await supabase.from('wall_likes').select('post_id,visitor_id').in('post_id', data.map((post) => post.id))
        if (likeError) setError(likeError.message)
        else setLikes(likeRows ?? [])
        const { urls, errors: signingErrors } = await loadSignedFiles(data.map((post) => post.attachment_path))
        setSignedFiles(urls)
        setAttachmentErrors(signingErrors)
      } else {
        setLikes([])
        setSignedFiles({})
        setAttachmentErrors({})
      }
    }
    setLoading(false)
  }, [loadSignedFiles])

  
const loadAnnouncements = useCallback(async () => {
  if (!supabase) {
    setAnnouncementLoading(false)
    return
  }

  setAnnouncementLoading(true)

  try {
    let request = supabase
      .from('announcements')
      .select(
        'id,title,summary,content,category,is_published,published_at,created_at,updated_at,created_by'
      )
      .order('created_at', { ascending: false })
      .limit(100)

    // Committee members can see drafts; everyone else sees published notices.
    if (!isCommittee) {
      request = request.eq('is_published', true)
    }

    const { data, error: fetchError } = await request

    if (fetchError) throw fetchError

    setAnnouncements(data ?? [])
  } catch (fetchError) {
    setError(`Could not load announcements: ${fetchError.message}`)
  } finally {
    setAnnouncementLoading(false)
  }
}, [isCommittee])
const loadLibraryModules = useCallback(async () => {
  if (!supabase) {
    setLibraryLoading(false)
    return
  }

  setLibraryLoading(true)

  try {
    let request = supabase
      .from('academic_modules')
      .select(
        'id,degree,year_of_study,semester,module_code,module_name,description,is_published,created_at,updated_at'
      )
      .order('year_of_study')
      .order('semester')
      .order('module_name')

    // Committee members can see drafts.
    // Students can see published modules only.
    if (!isCommittee) {
      request = request.eq('is_published', true)
    }

    const { data, error: fetchError } = await request

    if (fetchError) throw fetchError

    setLibraryModules(data ?? [])
  } catch (fetchError) {
    setError(`Could not load library modules: ${fetchError.message}`)
  } finally {
    setLibraryLoading(false)
  }
}, [isCommittee])

const loadExamPapers = useCallback(async () => {
  if (!supabase) {
    setExamPapers([])
    return
  }

  setExamsLoading(true)

  try {
    let request = supabase
      .from('exam_papers')
      .select(
        'id,degree,year_of_study,semester,module_code,module_name,exam_year,paper_type,title,description,file_url,is_published,created_at,updated_at'
      )
      .order('exam_year', { ascending: false })
      .order('module_code')

    if (!isCommittee) {
      request = request.eq('is_published', true)
    }

    const { data, error: fetchError } = await request

    if (fetchError) throw fetchError

    setExamPapers(data ?? [])
  } catch (fetchError) {
    setError(`Could not load exam papers: ${fetchError.message}`)
  } finally {
    setExamsLoading(false)
  }
}, [isCommittee])

async function saveExamPaper(event) {
  event.preventDefault()

  if (!supabase || !isCommittee || !session?.user) {
    setError('Committee access is required to manage exam papers.')
    return
  }

  const title = examForm.title.trim()
  const degree = examForm.degree.trim()
  const moduleCode = examForm.module_code.trim()
  const moduleName = examForm.module_name.trim()
  const fileUrl = examForm.file_url.trim()
  const examYearValue = Number(examForm.exam_year)
  const studyYearValue = Number(examForm.year_of_study)
  const semesterValue = Number(examForm.semester)

  if (!title || !degree || !moduleCode || !moduleName || !fileUrl) {
    setError('Please complete the title, degree, module code, module name, and paper URL.')
    return
  }

  let parsedUrl

  try {
    parsedUrl = new URL(fileUrl)
  } catch {
    setError('Please enter a valid paper URL.')
    return
  }

  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    setError('The paper URL must use HTTP or HTTPS.')
    return
  }

  if (
    !Number.isInteger(examYearValue) ||
    examYearValue < 2000 ||
    examYearValue > 2100 ||
    !Number.isInteger(studyYearValue) ||
    studyYearValue < 1 ||
    studyYearValue > 4 ||
    !Number.isInteger(semesterValue) ||
    semesterValue < 1 ||
    semesterValue > 8
  ) {
    setError('Check the exam year, year of study, and semester.')
    return
  }

  setExamsLoading(true)
  setError('')
  setNotice('')

  try {
    const payload = {
      degree,
      year_of_study: studyYearValue,
      semester: semesterValue,
      module_code: moduleCode,
      module_name: moduleName,
      exam_year: examYearValue,
      paper_type: examForm.paper_type,
      title,
      description: examForm.description.trim() || null,
      file_url: parsedUrl.toString(),
      is_published: Boolean(examForm.is_published),
      updated_at: new Date().toISOString(),
    }

    let result

    if (editingExamPaper) {
      result = await supabase
        .from('exam_papers')
        .update(payload)
        .eq('id', editingExamPaper.id)
    } else {
      result = await supabase
        .from('exam_papers')
        .insert({
          ...payload,
          created_by: session.user.id,
        })
    }

    if (result.error) throw result.error

    setNotice(
      payload.is_published
        ? 'Exam paper saved and published successfully.'
        : 'Exam paper saved as a draft.'
    )

    setExamFormOpen(false)
    setEditingExamPaper(null)

    setExamForm({
      degree: 'Applied Accounting',
      year_of_study: 1,
      semester: 1,
      module_code: '',
      module_name: '',
      exam_year: new Date().getFullYear(),
      paper_type: 'Final Exam',
      title: '',
      description: '',
      file_url: '',
      is_published: false,
    })

    await loadExamPapers()
  } catch (saveError) {
    setError(`Could not save exam paper: ${saveError.message}`)
  } finally {
    setExamsLoading(false)
  }
}

async function toggleExamPaperPublished(paper) {
  if (!supabase || !isCommittee || !session?.user) {
    setError('Committee access is required to manage exam papers.')
    return
  }

  setError('')
  setNotice('')

  try {
    const { error: updateError } = await supabase
      .from('exam_papers')
      .update({
        is_published: !paper.is_published,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paper.id)

    if (updateError) throw updateError

    setNotice(
      paper.is_published
        ? 'Exam paper unpublished successfully.'
        : 'Exam paper published successfully.'
    )

    await loadExamPapers()
  } catch (updateError) {
    setError(`Could not update exam paper: ${updateError.message}`)
  }
}

async function deleteExamPaper(paper) {
  if (!supabase || !isCommittee || !session?.user) {
    setError('Committee access is required to manage exam papers.')
    return
  }

  const confirmed = window.confirm(
    `Permanently delete "${paper.title}" from the Exam Paper Library? The original file will not be deleted.`
  )

  if (!confirmed) return

  setError('')
  setNotice('')

  try {
    const { error: deleteError } = await supabase
      .from('exam_papers')
      .delete()
      .eq('id', paper.id)

    if (deleteError) throw deleteError

    setNotice('Exam paper deleted successfully.')
    await loadExamPapers()
  } catch (deleteError) {
    setError(`Could not delete exam paper: ${deleteError.message}`)
  }
}

function openExamPaperForEdit(paper) {
  if (!isCommittee) {
    setError('Committee access is required to edit exam papers.')
    return
  }

  setEditingExamPaper(paper)

  setExamForm({
    degree: paper.degree,
    year_of_study: paper.year_of_study,
    semester: paper.semester,
    module_code: paper.module_code,
    module_name: paper.module_name,
    exam_year: paper.exam_year,
    paper_type: paper.paper_type,
    title: paper.title,
    description: paper.description ?? '',
    file_url: paper.file_url,
    is_published: paper.is_published,
  })

  setError('')
  setNotice('')
  setExamFormOpen(true)
}



const filteredExamPapers = examPapers.filter((paper) => {
  const search = examSearch.trim().toLowerCase()

  const matchesSearch =
    !search ||
    [paper.title, paper.module_code, paper.module_name, paper.description]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(search))

  return (
    matchesSearch &&
    (examDegree === 'All' || paper.degree === examDegree) &&
    (examStudyYear === 'All' ||
      String(paper.year_of_study) === examStudyYear) &&
    (examSemester === 'All' ||
      String(paper.semester) === examSemester) &&
    (examYear === 'All' || String(paper.exam_year) === examYear) &&
    (examPaperType === 'All' || paper.paper_type === examPaperType)
  )
})


const examDegrees = [
  'All',
  ...new Set(examPapers.map((paper) => paper.degree)),
]

const examYears = [
  'All',
  ...new Set(
    examPapers.map((paper) => String(paper.exam_year))
  ),
].sort((a, b) => {
  if (a === 'All') return -1
  if (b === 'All') return 1
  return Number(b) - Number(a)
})

const examPaperTypes = [
  'All',
  'Final Exam',
  'Midterm',
  'Mock Exam',
  'Other',
]



const loadLibraryResources = useCallback(async (moduleId) => {
  if (!supabase || !moduleId) {
    setLibraryResources([])
    return
  }

  try {
    let request = supabase
      .from('academic_resources')
      .select(
        'id,module_id,title,description,resource_type,storage_provider,storage_item_id,file_name,mime_type,file_size_bytes,external_url,access_mode,is_published,created_at,updated_at'
      )
      .eq('module_id', moduleId)
      .order('created_at', { ascending: false })

    if (!isCommittee) {
      request = request.eq('is_published', true)
    }

    const { data, error: fetchError } = await request

    if (fetchError) throw fetchError

    setLibraryResources(data ?? [])
  } catch (fetchError) {
    setError(`Could not load library resources: ${fetchError.message}`)
  }
}, [isCommittee])


async function saveAnnouncement(event) {
  event.preventDefault()

  if (!supabase || !isCommittee || !session?.user) {
    setError('Committee access is required to manage announcements.')
    return
  }

  const title = announcementForm.title.trim()
  const summary = announcementForm.summary.trim()
  const content = announcementForm.content.trim()

  if (!title || !content) {
    setError('Please enter an announcement title and content.')
    return
  }

  setAnnouncementSaving(true)
  setError('')
  setNotice('')

  const payload = {
    title,
    summary,
    content,
    category: announcementForm.category,
    is_published: announcementForm.is_published,
    published_at: announcementForm.is_published
      ? editingAnnouncement?.published_at || new Date().toISOString()
      : null,
    updated_at: new Date().toISOString(),
  }

  try {
    let result

    if (editingAnnouncement) {
      result = await supabase
        .from('announcements')
        .update(payload)
        .eq('id', editingAnnouncement.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('announcements')
        .insert({
          ...payload,
          created_by: session.user.id,
        })
        .select()
        .single()
    }

    if (result.error) throw result.error

    setNotice(
      payload.is_published
        ? 'Announcement published successfully.'
        : 'Draft saved successfully.'
    )

    setAnnouncementFormOpen(false)
    setEditingAnnouncement(null)

    setAnnouncementForm({
      title: '',
      summary: '',
      content: '',
      category: 'General',
      is_published: false,
    })

    await loadAnnouncements()
  } catch (saveError) {
    setError(`Could not save announcement: ${saveError.message}`)
  } finally {
    setAnnouncementSaving(false)
  }
}


async function saveLibraryModule(event) {
  event.preventDefault()

  if (!isCommittee || !supabase) {
    setError('You do not have permission to manage library modules.')
    return
  }

  const degree = libraryModuleForm.degree
  const year = Number(libraryModuleForm.year_of_study)
  const semester = Number(libraryModuleForm.semester)
  const moduleCode = libraryModuleForm.module_code.trim()
  const moduleName = libraryModuleForm.module_name.trim()

  if (!moduleCode || !moduleName) {
    setError('Please enter both the module code and module name.')
    return
  }

  if (
    year < 1 ||
    year > 4 ||
    ![year * 2 - 1, year * 2].includes(semester)
  ) {
    setError('Please select a semester that matches the year of study.')
    return
  }

  setLibrarySaving(true)
  setError('')

  try {
    const payload = {
      degree,
      year_of_study: year,
      semester,
      module_code: moduleCode,
      module_name: moduleName,
      description: libraryModuleForm.description.trim(),
      is_published: Boolean(libraryModuleForm.is_published),
    }

    let request

    if (editingLibraryModule?.id) {
      request = supabase
        .from('academic_modules')
        .update(payload)
        .eq('id', editingLibraryModule.id)
    } else {
      if (session?.user?.id) {
        payload.created_by = session.user.id
      }

      request = supabase
        .from('academic_modules')
        .insert(payload)
    }

    const { error: saveError } = await request

    if (saveError) throw saveError

    setLibraryFormOpen(false)
    setEditingLibraryModule(null)
    setSelectedLibraryModule(null)
    setLibraryModuleForm({
      degree: 'Applied Accounting',
      year_of_study: 1,
      semester: 1,
      module_code: '',
      module_name: '',
      description: '',
      is_published: false,
    })

    await loadLibraryModules()
  } catch (saveError) {
    setError(`Could not save library module: ${saveError.message}`)
  } finally {
    setLibrarySaving(false)
  }
}

async function saveLibraryResource(event) {
  event.preventDefault()

  if (!supabase || !isCommittee || !session?.user) {
    setError('Committee access is required to manage library resources.')
    return
  }

  if (!selectedLibraryModule?.id) {
    setError('Please open a module before adding a resource.')
    return
  }

  const title = libraryResourceForm.title.trim()
  const description = libraryResourceForm.description.trim()
  const resourceType = libraryResourceForm.resource_type
  const mode = libraryResourceMode

  if (!title) {
    setError('Please enter a resource title.')
    return
  }

  if (mode === 'upload' && !libraryResourceFile) {
    setError('Please select a file to upload.')
    return
  }

  let externalUrl = ''
  let storageProvider = 'external_link'
  let storageItemId = null
  let fileName = null
  let mimeType = null
  let fileSizeBytes = null

  setLibraryResourceSaving(true)
  setError('')
  setNotice('')

  let uploadedGoogleFile = null

  try {
    if (mode === 'upload') {
      const uploaded = await uploadToGoogleDrive(libraryResourceFile)

      uploadedGoogleFile = uploaded
      externalUrl = uploaded.url
      storageProvider = 'google_drive'
      storageItemId = uploaded.id
      fileName = uploaded.name
      mimeType = uploaded.mimeType
      fileSizeBytes = uploaded.size
    } else {
      externalUrl = libraryResourceForm.external_url.trim()

      getDriveStorageProvider(externalUrl)
    }

    const payload = {
      module_id: selectedLibraryModule.id,
      title,
      description,
      resource_type: resourceType,
      storage_provider: storageProvider,
      storage_item_id: storageItemId,
      file_name: fileName,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
      external_url: externalUrl,
      access_mode: 'view_only',
      is_published: Boolean(libraryResourceForm.is_published),
      created_by: session.user.id,
      updated_at: new Date().toISOString(),
    }

    const { error: insertError } = await supabase
      .from('academic_resources')
      .insert(payload)

    if (insertError) {
      if (uploadedGoogleFile) {
        try {
          await uploadedGoogleFile.remove()
        } catch (cleanupError) {
          throw new Error(
            `${insertError.message} The Google Drive file was uploaded but could not be removed automatically: ${cleanupError.message}`
          )
        }
      }

      throw insertError
    }

    setNotice(
      payload.is_published
        ? 'Resource added and published successfully.'
        : 'Resource saved as a draft.'
    )

    resetLibraryResourceForm()
    setLibraryResourceFormOpen(false)

    await loadLibraryResources(selectedLibraryModule.id)
  } catch (saveError) {
    setError(`Could not save library resource: ${saveError.message}`)
  } finally {
    setLibraryResourceSaving(false)
  }
}

function startEditingLibraryResource(resource) {
  setEditingLibraryResource(resource)
  setLibraryResourceForm({
    title: resource.title ?? '',
    description: resource.description ?? '',
    resource_type: resource.resource_type ?? 'Lecture Notes',
    external_url: resource.external_url ?? '',
    is_published: Boolean(resource.is_published),
  })
  setLibraryResourceMode(
    resource.storage_provider === 'external_link' ? 'link' : 'upload'
  )
  setLibraryResourceFile(null)
  setLibraryResourceFormOpen(true)
  setError('')
  setNotice('')
}

function resetLibraryResourceForm() {
  setEditingLibraryResource(null)
  setLibraryResourceFile(null)
  setLibraryResourceMode('upload')
  setLibraryResourceForm({ ...LIBRARY_RESOURCE_FORM_DEFAULTS })
}

function openNewLibraryResourceForm() {
  resetLibraryResourceForm()
  setLibraryResourceFormOpen(true)
  setError('')
  setNotice('')
}

async function toggleLibraryResourcePublished(resource) {
  if (!supabase || !isCommittee) {
    setError('Committee access is required to manage library resources.')
    return
  }

  setError('')
  setNotice('')

  try {
    const { error: updateError } = await supabase
      .from('academic_resources')
      .update({
        is_published: !resource.is_published,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resource.id)

    if (updateError) throw updateError

    setNotice(
      resource.is_published
        ? 'Resource unpublished successfully.'
        : 'Resource published successfully.'
    )

    await loadLibraryResources(selectedLibraryModule.id)
  } catch (updateError) {
    setError(`Could not update resource: ${updateError.message}`)
  }
}

async function deleteLibraryResource(resource) {
  if (!supabase || !isCommittee) {
    setError('Committee access is required to manage library resources.')
    return
  }

  const confirmed = window.confirm(
    `Delete "${resource.title}" from the Academic Library? The original file in Google Drive or OneDrive will not be deleted.`
  )

  if (!confirmed) return

  setError('')
  setNotice('')

  try {
    const { error: deleteError } = await supabase
      .from('academic_resources')
      .delete()
      .eq('id', resource.id)

    if (deleteError) throw deleteError

    setNotice('Resource deleted from the Academic Library.')
    await loadLibraryResources(selectedLibraryModule.id)
  } catch (deleteError) {
    setError(`Could not delete resource: ${deleteError.message}`)
  }
}

async function updateLibraryResource(event) {
  event.preventDefault()

  if (!supabase || !isCommittee || !editingLibraryResource) {
    setError('Committee access is required to edit library resources.')
    return
  }

  const title = libraryResourceForm.title.trim()
  const description = libraryResourceForm.description.trim()
  const resourceType = libraryResourceForm.resource_type

  if (!title) {
    setError('Please enter a resource title.')
    return
  }

  setLibraryResourceUpdating(true)
  setError('')
  setNotice('')

  try {
    const payload = {
      title,
      description,
      resource_type: resourceType,
      is_published: Boolean(libraryResourceForm.is_published),
      updated_at: new Date().toISOString(),
    }

    // Keep the existing file reference for uploaded files.
    // Only update the URL for resources originally saved as external links.
    if (editingLibraryResource.storage_provider === 'external_link') {
      const externalUrl = libraryResourceForm.external_url.trim()

      getDriveStorageProvider(externalUrl)
      payload.external_url = externalUrl
    } else {
      const storedProvider = getStoredResourceProvider(editingLibraryResource)

      if (storedProvider === 'google_drive') {
        payload.storage_provider = storedProvider
      }
    }

    const { error: updateError } = await supabase
      .from('academic_resources')
      .update(payload)
      .eq('id', editingLibraryResource.id)

    if (updateError) throw updateError

    setNotice('Resource updated successfully.')
    resetLibraryResourceForm()
    setLibraryResourceFormOpen(false)

    await loadLibraryResources(selectedLibraryModule.id)
  } catch (updateError) {
    setError(`Could not edit resource: ${updateError.message}`)
  } finally {
    setLibraryResourceUpdating(false)
  }
}


async function toggleAnnouncementPublished(item) {
  if (!supabase || !isCommittee || !session?.user) {
    setError('Committee access is required to manage announcements.')
    return
  }

  const willPublish = !item.is_published

  setError('')
  setNotice('')
  setAnnouncementSaving(true)

  try {
    const payload = {
      is_published: willPublish,
      published_at: willPublish
        ? item.published_at || new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from('announcements')
      .update(payload)
      .eq('id', item.id)

    if (updateError) throw updateError

    setNotice(
      willPublish
        ? 'Announcement published successfully.'
        : 'Announcement unpublished successfully.'
    )

    await loadAnnouncements()
  } catch (toggleError) {
    setError(`Could not update announcement: ${toggleError.message}`)
  } finally {
    setAnnouncementSaving(false)
  }
}

async function deleteAnnouncement(item) {
  if (!supabase || !isCommittee || !session?.user) {
    setError('Committee access is required to manage announcements.')
    return
  }

  const confirmed = window.confirm(
    `Are you sure you want to permanently delete "${item.title}"?\n\nThis action cannot be undone.`
  )

  if (!confirmed) return

  setError('')
  setNotice('')
  setAnnouncementSaving(true)

  try {
    const { error: deleteError } = await supabase
      .from('announcements')
      .delete()
      .eq('id', item.id)

    if (deleteError) throw deleteError

    if (editingAnnouncement?.id === item.id) {
      setAnnouncementFormOpen(false)
      setEditingAnnouncement(null)
    }

    setNotice('Announcement deleted successfully.')
    await loadAnnouncements()
  } catch (deleteError) {
    setError(`Could not delete announcement: ${deleteError.message}`)
  } finally {
    setAnnouncementSaving(false)
  }
}



  useEffect(() => {
    loadFeed()
    if (!supabase) return undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setVisitorId(nextSession?.user?.id || '')
      setIsCommittee(false)
    })
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (currentSession) {
        setSession(currentSession)
        setVisitorId(currentSession.user.id)
      } else {
        const { error: anonymousError } = await supabase.auth.signInAnonymously()
        if (anonymousError) setError(`Enable anonymous sign-ins in Supabase Auth to use likes: ${anonymousError.message}`)
      }
    })
    return () => subscription.unsubscribe()
  }, [loadFeed])

useEffect(() => {
  if (activePage === 'announcements') {
    loadAnnouncements()
  }
}, [activePage, loadAnnouncements])
useEffect(() => {
  if (activePage === 'library') {
    loadLibraryModules()
  }
}, [activePage, loadLibraryModules])

useEffect(() => {
  if (activePage === 'exams') {
    loadExamPapers()
  }
}, [activePage, loadExamPapers])



  useEffect(() => {
    if (!supabase || !session?.user || session.user.is_anonymous) {
  setIsCommittee(false)
  return
}
    let active = true
    supabase.rpc('is_committee_member').then(({ data, error: rpcError }) => {
      if (!active) return
      if (rpcError) setError(rpcError.message)
      setIsCommittee(Boolean(data))
      if (data) loadPending()
    })
    return () => { active = false }
  }, [session, loadFeed])

  async function loadPending() {
    const { data, error: pendingError } = await supabase.from('wall_posts')
      .select('id,name,batch,content,attachment_path,created_at,status,is_anonymous')
      .in('status', ['pending', 'revision_requested'])
      .order('created_at', { ascending: true })
    if (pendingError) {
      setError(pendingError.message)
      return
    }
    const privatePosts = data ?? []
    setPendingPosts(privatePosts)
    const { urls, errors: signingErrors } = await loadSignedFiles(privatePosts.map((post) => post.attachment_path))
    setSignedFiles(urls)
    setAttachmentErrors(signingErrors)
  }

  const [pendingPosts, setPendingPosts] = useState([])

  const visiblePosts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return posts
    return posts.filter((post) => `${post.is_anonymous ? 'anonymous student' : post.name} ${post.is_anonymous ? '' : post.batch} ${post.content}`.toLocaleLowerCase().includes(term))
  }, [posts, query])

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function submitPost(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!supabase) return setError('Add your Supabase URL and publishable key to .env to enable submissions.')
    if (form.name.trim().length < 2 || form.name.trim().length > 100) return setError('Please enter a name between 2 and 100 characters.')
    if (!form.batch.trim() || form.batch.trim().length > 50) return setError('Please enter your batch (up to 50 characters).')
    if (!form.content.trim() || form.content.trim().length > 10000) return setError('Your post must be between 1 and 10,000 characters.')
    if (file && (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_ATTACHMENT_BYTES)) return setError('Choose a JPG, PNG, WEBP or PDF file up to 5 MB.')
    setSubmitting(true)
    let attachmentPath = null
    const postId = crypto.randomUUID()
    if (file) {
      const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
      attachmentPath = `${postId}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(attachmentPath, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        setSubmitting(false)
        return setError(`Attachment upload failed: ${uploadError.message}`)
      }
    }
    const { error: insertError } = await supabase.from('wall_posts').insert({
      id: postId,
      name: form.name.trim(),
      batch: form.batch.trim(),
      content: form.content.trim(),
      is_anonymous: form.isAnonymous,
      attachment_path: attachmentPath,
      status: 'pending',
    })
    if (insertError) {
      if (attachmentPath) await supabase.storage.from(BUCKET).remove([attachmentPath])
      setError(insertError.message)
    } else {
      setNotice('Your post is with the Education Committee for review. Thanks for sharing!')
      setForm({ name: '', batch: '', content: '', isAnonymous: false })
      setFile(null)
      setComposerOpen(false)
    }
    setSubmitting(false)
  }

  async function toggleLike(postId) {
    if (!supabase || !visitorId) return
    setError('')
    const existing = likes.find((like) => like.post_id === postId && like.visitor_id === visitorId)
    if (existing) {
      const { error: deleteError } = await supabase.from('wall_likes').delete().eq('post_id', postId).eq('visitor_id', visitorId)
      if (deleteError) setError(deleteError.message)
      else setLikes((current) => current.filter((like) => !(like.post_id === postId && like.visitor_id === visitorId)))
    } else {
      const { data, error: insertError } = await supabase.from('wall_likes').insert({ post_id: postId, visitor_id: visitorId }).select('post_id,visitor_id').single()
      if (insertError) setError(insertError.message)
      else setLikes((current) => [...current, data])
    }
  }

  async function signInCommittee(event) {
    event.preventDefault()
    setAdminBusy(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
    setAdminBusy(false)
    if (authError) setError(authError.message)
  }

  async function reviewPost(postId, decision) {
    const feedback = decisionFeedback[postId] || null
    setAdminBusy(true)
    setError('')
    const { error: reviewError } = await supabase.rpc('review_wall_post', { p_post_id: postId, p_decision: decision, p_feedback: feedback })
    if (reviewError) setError(reviewError.message)
    else {
      setPendingPosts((current) => current.filter((post) => post.id !== postId))
      if (decision === 'approved') await loadFeed()
      setNotice(`Post ${decision === 'revision_requested' ? 'sent back for revision' : `${decision} successfully`}.`)
    }
    setAdminBusy(false)
  }

  async function signOutCommittee() {
    await supabase.auth.signOut()
    const { error: anonymousError } = await supabase.auth.signInAnonymously()
    if (anonymousError) setError(`Enable anonymous sign-ins in Supabase Auth to continue using reactions: ${anonymousError.message}`)
    setPendingPosts([])
    setIsCommittee(false)
  }

  return (
    <div className="site-shell">
      
      <header className="topbar">
        <a className="brand" href="#top" aria-label="SABSA Academic Hub home">
        <span className="brand-mark">S</span>
        <span className="brand-copy">
        <strong>SAB</strong>
       <span>STUDENTS' ASSOCIATION</span>
        </span>
        </a>

        <div className="site-title">
        <h1>SABSA Academic HUB</h1>
        <p>Education Community · SAB Students’ Association</p>
        </div>

        <button
          className="committee-link"
        onClick={() => {
        setAdminOpen(true)
        setError('')
          }}
          >
        <Icon name="shield" size={16}/>
        <span>Committee</span>
        </button>
      </header>


      <nav className="page-nav" aria-label="Main navigation">
        <button
          className={activePage === 'wall' ? 'active' : ''}
          onClick={() => setActivePage('wall')}
        >
          Students’ Wall
        </button>
        <button
          className={activePage === 'announcements' ? 'active' : ''}
          onClick={() => setActivePage('announcements')}
        >
          Announcements
        </button>
        <button
          className={activePage === 'library' ? 'active' : ''}
          onClick={() => setActivePage('library')}
        >
          Academic Library
        </button>
        <button
          className={activePage === 'exams' ? 'active' : ''}
          onClick={() => setActivePage('exams')}
        >
          Exams
        </button>
        <button
          className="president-link"
          onClick={() => setNotice('Tell to President will be available in a future update.')}
        >
          Tell to President
        </button>
      </nav>


      <main id="top">
        {activePage === 'wall' && <>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><span className="live-dot"/> THE STUDENTS’ WALL</span>
            <h1>One community.<br/><span>Many stories.</span></h1>
            <p>A little corner of SAB where every batch, every idea and every voice belongs.</p>
            <div className="hero-proof"><span className="proof-avatars"><i>✦</i><i>✺</i><i>✿</i></span><span>Made by students, for students</span></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun-shape"/><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
            <div className="art-note note-one"><span>✦</span><b>Learn</b><small>grow together</small></div>
            <div className="art-note note-two"><span>✿</span><b>Share</b><small>your story</small></div>
            <div className="art-note note-three"><span>↗</span><b>Connect</b><small>across batches</small></div>
            <div className="art-center"><span>SAB</span><small>STUDENTS’ ASSOCIATION</small></div>
          </div>
          <div className="hero-stamp">A space<br/>to belong <span>↘</span></div>
        </section>

        <section className="wall-section" id="wall">
          <div className="section-heading"><div><span className="eyebrow muted">THE COMMUNITY BOARD</span><h2>From our wall</h2></div><p>Good things happen when we<br className="desktop-break"/> put our thoughts out there.</p></div>
          <div className="feed-tools">
            <label className="search-box"><Icon name="search" size={19}/><input aria-label="Search posts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stories, names, batches..."/><kbd>⌕</kbd></label>
            <button className="create-button" onClick={() => { setComposerOpen(true); setNotice(''); setError('') }}><Icon name="plus" size={18}/>Create post</button>
          </div>

          {notice && <div className="notice success-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
          {error && !adminOpen && <div className="notice error-notice" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
          {!isSupabaseConfigured && <div className="config-notice"><strong>Connect the wall</strong><span>Add the Supabase URL and publishable key in <code>.env</code> to load posts and enable submissions.</span></div>}
          {loading ? <div className="empty-state"><span className="loader"/><p>Gathering stories...</p></div> : visiblePosts.length ? <div className="post-list">
            {visiblePosts.map((post, index) => {
              const postLikes = likes.filter((like) => like.post_id === post.id)
              const liked = postLikes.some((like) => like.visitor_id === visitorId)
              const publicName = post.is_anonymous ? 'Anonymous student' : post.name
              const publicBatch = post.is_anonymous ? 'Shared anonymously' : `Batch ${post.batch}`
              return <article className="post-card" key={post.id} style={{ '--card-index': index }}>
                <div className="post-top"><div className={`avatar avatar-${index % 5}${post.is_anonymous ? ' anonymous-avatar' : ''}`}>{post.is_anonymous ? '✦' : initials(publicName)}</div><div className="post-author"><strong>{publicName}</strong><span>{publicBatch}</span></div><span className="post-time">{relativeDate(post.published_at || post.created_at)}</span></div>
                <p className="post-content">{post.content}</p>
                <Attachment path={post.attachment_path} signedUrl={signedFiles[post.attachment_path]} error={attachmentErrors[post.attachment_path]}/>
                <div className="post-bottom"><button className={`like-button${liked ? ' is-liked' : ''}`} onClick={() => toggleLike(post.id)} aria-pressed={liked} aria-label={`${liked ? 'Unlike' : 'Like'} post by ${publicName}`}><Icon name="heart" size={19} fill={liked ? 'currentColor' : 'none'}/><span>{postLikes.length}</span><span className="like-label">{postLikes.length === 1 ? 'like' : 'likes'}</span></button><span className="published-label"><span/> On the wall</span></div>
              </article>
            })}
          </div> : <div className="empty-state"><span className="empty-spark">✳</span><h3>{query ? 'Nothing found just yet.' : 'A fresh wall, full of possibility.'}</h3><p>{query ? 'Try another name, batch or phrase.' : 'Be the first to share a thought with the SAB community.'}</p>{!query && <button className="text-button" onClick={() => setComposerOpen(true)}>Write the first post <span>↗</span></button>}</div>}
        </section>

        <section className="bottom-callout"><div className="callout-star">✳</div><div><span className="eyebrow">YOUR WORDS MAKE THE WALL</span><h2>Have something to share?</h2><p>Drop a thought, celebrate a win or leave a little note for your batchmates.</p></div><button className="create-button light-button" onClick={() => setComposerOpen(true)}><Icon name="plus" size={18}/>Create a post</button></section>
              </>}

        
{activePage === 'announcements' && (
  <section className="announcements-page">
    <div className="announcements-heading">
      <span className="eyebrow muted">SABSA ACADEMIC HUB</span>
      <h1>Announcements</h1>
      <p>Important updates, notices and deadlines for SAB students.</p>
    </div>

    <div className="announcement-tools">
      <input
        type="search"
        placeholder="Search announcements..."
        value={announcementSearch}
        onChange={(event) => setAnnouncementSearch(event.target.value)}
        aria-label="Search announcements"
      />

      
<div className="category-dropdown">
  <button
    type="button"
    className={`category-dropdown-trigger ${categoryDropdownOpen ? 'is-open' : ''}`}
    aria-haspopup="listbox"
    aria-expanded={categoryDropdownOpen}
    onClick={() => setCategoryDropdownOpen((open) => !open)}
  >
    <span>{announcementCategory}</span>
    <Icon
      name="chevron-down"
      size={16}
    />
  </button>

  {categoryDropdownOpen && (
    <div
      className="category-dropdown-menu"
      role="listbox"
      aria-label="Filter announcements by category"
    >
      {['All', 'Academic', 'Examinations', 'Events', 'Deadlines', 'General'].map((category) => (
        <button
          key={category}
          type="button"
          role="option"
          aria-selected={announcementCategory === category}
          className={`category-dropdown-option ${
            announcementCategory === category ? 'is-selected' : ''
          }`}
          onClick={() => {
            setAnnouncementCategory(category)
            setCategoryDropdownOpen(false)
          }}
        >
          <span>{category}</span>
          {announcementCategory === category && (
            <Icon name="check" size={15} />
          )}
        </button>
      ))}
    </div>
  )}
</div>


      {isCommittee && (
        <button
          className="create-button"
          onClick={() => {
            setEditingAnnouncement(null)
            setAnnouncementForm({
              title: '',
              summary: '',
              content: '',
              category: 'General',
              is_published: false,
            })
            setAnnouncementFormOpen(true)
          }}
        >
          <Icon name="plus" size={18} />
          New announcement
        </button>
      )}
    </div>

    {announcementLoading ? (
      <div className="empty-state">
        <span className="loader" />
        <p>Loading announcements...</p>
      </div>
    ) : (
      <div className="announcement-list">
        {announcements
          .filter((item) =>
            announcementCategory === 'All' ||
            item.category === announcementCategory
          )
          .filter((item) =>
            `${item.title} ${item.summary} ${item.content} ${item.category}`
              .toLowerCase()
              .includes(announcementSearch.trim().toLowerCase())
          )
          .map((item) => (
            <article className="announcement-card" key={item.id}>
              
<div className="announcement-card-top">
  <span className="announcement-category">
    {item.category}
  </span>

  <span className="announcement-date">
    {item.published_at
      ? new Date(item.published_at).toLocaleDateString()
      : 'Not published'}
  </span>

  <span
    className={`status-pill ${item.is_published ? 'approved' : 'pending'}`}
  >
    {item.is_published ? 'Published' : 'Draft'}
  </span>
</div>

              <h2>{item.title}</h2>

              {item.summary && <p className="announcement-summary">{item.summary}</p>}

              <p className="announcement-content">{item.content}</p>

{isCommittee && (
  <div className="announcement-actions">
    <button
      type="button"
      className="text-button"
      onClick={() => {
        setEditingAnnouncement(item)
        setAnnouncementForm({
          title: item.title,
          summary: item.summary || '',
          content: item.content,
          category: item.category,
          is_published: item.is_published,
        })
        setAnnouncementFormOpen(true)
        setError('')
        setNotice('')
      }}
    >
      <Icon name="pencil" size={15} />
      Edit
    </button>

    <button
      type="button"
      className="text-button"
      disabled={announcementSaving}
      onClick={() => toggleAnnouncementPublished(item)}
    >
      <Icon name="eye" size={15} />
      {item.is_published ? 'Unpublish' : 'Publish'}
    </button>

<button
  type="button"
  className="reject-button"
  disabled={announcementSaving}
  onClick={() => deleteAnnouncement(item)}
>
  <Icon name="trash-2" size={15} />
  Delete
</button>

  </div>
)}

            </article>
          ))}

        {announcements.filter((item) =>
          (announcementCategory === 'All' ||
            item.category === announcementCategory) &&
          `${item.title} ${item.summary} ${item.content} ${item.category}`
            .toLowerCase()
            .includes(announcementSearch.trim().toLowerCase())
        ).length === 0 && (
          <div className="empty-state">
            <span className="empty-spark">✳</span>
            <h3>No announcements yet</h3>
            <p>Published notices will appear here.</p>
          </div>
        )}
      </div>
    )}
  </section>
)}


        {activePage === 'library' && (
  <section className="academic-library">
    <div className="library-heading">
      <span className="eyebrow muted">LEARN AND EXPLORE</span>
      <h1>Academic Library</h1>
      <p>
        Find lecture materials, module resources and study
        documents for your degree.
      </p>
    </div>
  

    <div className="library-degree-grid">
      {LIBRARY_DEGREES.map((degree) => (
        <button
          type="button"
          key={degree}
          className={`library-degree-card ${
            libraryDegree === degree ? 'is-selected' : ''
          }`}
          onClick={() => {
            setLibraryDegree(degree)
            setSelectedLibraryModule(null)
            setLibrarySearch('')
            setLibraryResourceType('All')
          }}
        >
          <span className="library-degree-icon">
            {degree === 'Applied Accounting' ? 'Aa' : 'Ba'}
          </span>
          <span className="library-degree-copy">
            <strong>{degree}</strong>
            <small>4 years · 8 semesters</small>
          </span>
          <span className="library-degree-arrow">↗</span>
        </button>
      ))}
    </div>

{libraryFormOpen && isCommittee && (
  <div className="library-form-panel">
    <div className="library-section-title">
      <div>
        <h3>Add Academic Module</h3>
        <p>Enter the official module details.</p>
      </div>
      <button
        type="button"
        className="text-button"
        onClick={() => setLibraryFormOpen(false)}
      >
        Cancel
      </button>
    </div>

    <form onSubmit={saveLibraryModule} className="library-module-form">
      <label>
        Degree
        <select
          value={libraryModuleForm.degree}
          onChange={(event) =>
            setLibraryModuleForm((current) => ({
              ...current,
              degree: event.target.value,
            }))
          }
        >
          {LIBRARY_DEGREES.map((degree) => (
            <option key={degree} value={degree}>
              {degree}
            </option>
          ))}
        </select>
      </label>

      <label>
        Year of study
        <select
          value={libraryModuleForm.year_of_study}
          onChange={(event) => {
            const year = Number(event.target.value)
            setLibraryModuleForm((current) => ({
              ...current,
              year_of_study: year,
              semester: year * 2 - 1,
            }))
          }}
        >
          {LIBRARY_YEARS.map((year) => (
            <option key={year} value={year}>
              Year {year}
            </option>
          ))}
        </select>
      </label>

      <label>
        Semester
        <select
          value={libraryModuleForm.semester}
          onChange={(event) =>
            setLibraryModuleForm((current) => ({
              ...current,
              semester: Number(event.target.value),
            }))
          }
        >
          {LIBRARY_SEMESTERS
            .filter(
              (semester) =>
                semester.year ===
                Number(libraryModuleForm.year_of_study)
            )
            .map((semester) => (
              <option key={semester.value} value={semester.value}>
                {semester.label}
              </option>
            ))}
        </select>
      </label>

      <label>
        Module code
        <input
          type="text"
          required
          maxLength={50}
          value={libraryModuleForm.module_code}
          onChange={(event) =>
            setLibraryModuleForm((current) => ({
              ...current,
              module_code: event.target.value,
            }))
          }
          placeholder="e.g. BSAA 12062"
        />
      </label>

      <label>
        Module name
        <input
          type="text"
          required
          maxLength={200}
          value={libraryModuleForm.module_name}
          onChange={(event) =>
            setLibraryModuleForm((current) => ({
              ...current,
              module_name: event.target.value,
            }))
          }
          placeholder="Enter the official module name"
        />
      </label>

      <label className="library-form-full">
        Description
        <textarea
          rows={3}
          value={libraryModuleForm.description}
          onChange={(event) =>
            setLibraryModuleForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          placeholder="Optional module description"
        />
      </label>

      <label className="library-publish-option">
        <input
          type="checkbox"
          checked={libraryModuleForm.is_published}
          onChange={(event) =>
            setLibraryModuleForm((current) => ({
              ...current,
              is_published: event.target.checked,
            }))
          }
        />
        Publish immediately
      </label>

      <div className="library-form-actions library-form-full">
        <button
          type="button"
          className="text-button"
          onClick={() => setLibraryFormOpen(false)}
          disabled={librarySaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="primary-button"
          disabled={librarySaving}
        >
          {librarySaving ? 'Saving...' : 'Save Module'}
        </button>
      </div>
    </form>
  </div>
)}

    <div className="library-browser">
      <div className="library-browser-heading">
        <div>
          <span className="eyebrow muted">YOUR STUDY SPACE</span>
          <h2>{libraryDegree}</h2>
          <p>Select your year and semester to explore modules.</p>
        </div>
        {selectedLibraryModule && (
          <button
            type="button"
            className="text-button"
            onClick={() => setSelectedLibraryModule(null)}
          >
            ← All modules
          </button>
        )}
      </div>

      <div className="library-year-selector">
        {LIBRARY_YEARS.map((year) => (
          <button
            type="button"
            key={year}
            className={libraryYear === year ? 'is-active' : ''}
            onClick={() => {
              setLibraryYear(year)
              setLibrarySemester((year - 1) * 2 + 1)
              setSelectedLibraryModule(null)
            }}
          >
            <span>Year {year}</span>
          </button>
        ))}
      </div>

      <div className="library-semester-selector">
        {LIBRARY_SEMESTERS
          .filter((semester) => semester.year === libraryYear)
          .map((semester) => (
            <button
              type="button"
              key={semester.value}
              className={
                librarySemester === semester.value ? 'is-active' : ''
              }
              onClick={() => {
                setLibrarySemester(semester.value)
                setSelectedLibraryModule(null)
              }}
            >
              {semester.label}
            </button>
          ))}
      </div>

      <div className="library-filters">
        <label className="library-search">
          <Icon name="search" size={19} />
          <input
            type="search"
            value={librarySearch}
            onChange={(event) => {
              setLibrarySearch(event.target.value)
              setSelectedLibraryModule(null)
            }}
            placeholder={
  selectedLibraryModule
    ? 'Search resources by title, description, or file name...'
    : 'Search modules by name or code...'
}
            aria-label="Search library modules"
          />
        </label>

        <label className="library-type-filter">
          <span>Resource type</span>
          <select
            value={libraryResourceType}
            onChange={(event) =>
              setLibraryResourceType(event.target.value)
            }
          >
            {LIBRARY_RESOURCE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      
{!selectedLibraryModule ? (
  <>
    <div className="library-section-title">
      <div>
        <h3>Modules</h3>
        <p>
          Year {libraryYear} · Semester {librarySemester}
        </p>
      </div>
      
<div className="library-heading-actions">
  <span className="library-count">
    {libraryModules.filter(
      (module) =>
        module.degree === libraryDegree &&
        module.year_of_study === libraryYear &&
        module.semester === librarySemester &&
        `${module.module_name} ${module.module_code}`
          .toLowerCase()
          .includes(librarySearch.trim().toLowerCase())
    ).length} modules
  </span>

  {isCommittee && (
    <button
      type="button"
      className="primary-button"
      onClick={() => {
        setEditingLibraryModule(null)
        setLibraryModuleForm({
          degree: libraryDegree,
          year_of_study: libraryYear,
          semester: librarySemester,
          module_code: '',
          module_name: '',
          description: '',
          is_published: false,
        })
        setLibraryFormOpen(true)
      }}
    >
      <Icon name="plus" size={16} />
      Add Module
    </button>
  )}
</div>

    </div>

    {libraryLoading ? (
      <div className="library-empty">
        <p>Loading modules...</p>
      </div>
    ) : (
      <div className="library-module-grid">
        {libraryModules
          .filter(
            (module) =>
              module.degree === libraryDegree &&
              module.year_of_study === libraryYear &&
              module.semester === librarySemester &&
              `${module.module_name} ${module.module_code}`
                .toLowerCase()
                .includes(librarySearch.trim().toLowerCase())
          )
          .map((module) => (
            <article className="library-module-card" key={module.id}>
              <button
                type="button"
                className="library-module-open-button"
                onClick={() => {
                  setSelectedLibraryModule(module)
                  loadLibraryResources(module.id)
              }}
              >
              <span className="library-module-icon">
                <Icon name="book-open" size={22} />
              </span>
              <span className="library-module-code">
                {module.module_code}
              </span>
              <strong>{module.module_name}</strong>
              <small>
                Year {module.year_of_study} · Semester {module.semester}
              </small>
                <span className="library-module-open">
                  Open module <span>↗</span>
                </span>
              </button>

{isCommittee && (
  <div className="library-card-actions">
    <button
      type="button"
      className="library-card-edit"
      onClick={() => {
        setEditingLibraryModule(module)
        setLibraryModuleForm({
          degree: module.degree,
          year_of_study: module.year_of_study,
          semester: module.semester,
          module_code: module.module_code,
          module_name: module.module_name,
          description: module.description || '',
          is_published: module.is_published,
        })
        setLibraryFormOpen(true)
      }}
    >
      <Icon name="pencil" size={14} /> Edit
    </button>

<button
  type="button"
  className="library-card-publish"
  onClick={async () => {
    if (!isCommittee || !supabase) return

    const nextPublished = !module.is_published
    const confirmed = window.confirm(
      nextPublished
        ? `Publish "${module.module_name}" for students?`
        : `Unpublish "${module.module_name}"?`
    )

    if (!confirmed) return

    setError('')

    try {
      const { error: updateError } = await supabase
        .from('academic_modules')
        .update({ is_published: nextPublished })
        .eq('id', module.id)

      if (updateError) throw updateError

      await loadLibraryModules()
    } catch (updateError) {
      setError(
        `Could not update publication status: ${updateError.message}`
      )
    }
  }}
>
  <Icon
    name={module.is_published ? 'eye-off' : 'eye'}
    size={14}
  />
  {module.is_published ? 'Unpublish' : 'Publish'}
    </button>

<button
  type="button"
  className="library-card-delete"
  onClick={async () => {
    if (!isCommittee || !supabase) return

    const confirmed = window.confirm(
      `Delete "${module.module_name}" (${module.module_code})? This cannot be undone.`
    )

    if (!confirmed) return

    setError('')

    try {
      const { error: deleteError } = await supabase
        .from('academic_modules')
        .delete()
        .eq('id', module.id)

      if (deleteError) throw deleteError

      if (selectedLibraryModule?.id === module.id) {
        setSelectedLibraryModule(null)
      }

      await loadLibraryModules()
    } catch (deleteError) {
      setError(`Could not delete module: ${deleteError.message}`)
    }
  }}
>
  <Icon name="trash-2" size={14} />
  Delete
    </button>


  </div>
)}

            </article>
          ))}
      </div>
    )}

    {!libraryLoading &&
      libraryModules.filter(
        (module) =>
          module.degree === libraryDegree &&
          module.year_of_study === libraryYear &&
          module.semester === librarySemester &&
          `${module.module_name} ${module.module_code}`
            .toLowerCase()
            .includes(librarySearch.trim().toLowerCase())
      ).length === 0 && (
        <div className="library-empty">
          <Icon name="search" size={26} />
          <h3>No matching modules</h3>
          <p>
            {isCommittee
              ? 'No modules found. Add a module to this semester or try another search.'
              : 'No published modules are available for this semester yet.'}
          </p>
        </div>
      )}
  </>
) : (
  <div className="library-module-detail">
    <span className="library-module-icon">
      <Icon name="book-open" size={24} />
    </span>
    <span className="eyebrow muted">
      {selectedLibraryModule.module_code}
    </span>
    <h3>{selectedLibraryModule.module_name}</h3>
    <p>
      {selectedLibraryModule.degree} · Year{' '}
      {selectedLibraryModule.year_of_study} · Semester{' '}
      {selectedLibraryModule.semester}
    </p>

    {selectedLibraryModule.description && (
      <p>{selectedLibraryModule.description}</p>
    )}

    <div className="library-resources-section">
  <div className="library-resources-heading">
    <div>
      <h4>Study Resources</h4>
      <p>
        Lecture notes, presentations, past papers, and other learning
        materials for this module.
      </p>
    </div>

    {isCommittee && (
      <button
        type="button"
        className="primary-button"
        onClick={openNewLibraryResourceForm}
      >
        + Add Resource
      </button>
    )}
  </div>

  {notice && (
    <p className="library-feedback library-feedback-success" role="status">
      {notice}
    </p>
  )}

  {error && (
    <p className="library-feedback library-feedback-error" role="alert">
      {error}
    </p>
  )}

  {isCommittee && libraryResourceFormOpen && (
    <form
  className="library-resource-form"
  onSubmit={editingLibraryResource ? updateLibraryResource : saveLibraryResource}
>
      <h5>{editingLibraryResource ? 'Edit Study Resource' : 'Add a Study Resource'}</h5>

      <label>
        Resource title
        <input
          type="text"
          value={libraryResourceForm.title}
          onChange={(event) =>
            setLibraryResourceForm((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
          placeholder="e.g. Lecture 01 — Introduction"
          required
        />
      </label>

      <label>
        Description
        <textarea
          value={libraryResourceForm.description}
          onChange={(event) =>
            setLibraryResourceForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          placeholder="Briefly describe this resource"
          rows={3}
        />
      </label>

      <label>
        Resource type
        <select
          value={libraryResourceForm.resource_type}
          onChange={(event) =>
            setLibraryResourceForm((current) => ({
              ...current,
              resource_type: event.target.value,
            }))
          }
        >
          
          {LIBRARY_RESOURCE_TYPES.slice(1).map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}

        </select>
      </label>

      {editingLibraryResource ? (
        editingLibraryResource.storage_provider === 'external_link' ? (
          <label>
            Google Drive or OneDrive sharing URL
            <input
              type="url"
              value={libraryResourceForm.external_url}
              onChange={(event) =>
                setLibraryResourceForm((current) => ({
                  ...current,
                  external_url: event.target.value,
                }))
              }
              placeholder="https://drive.google.com/..."
              required
            />
            <small>
              Make sure the sharing permissions allow your intended students
              to access the resource.
            </small>
          </label>
        ) : (
          <p className="library-resource-storage-note">
            This file is stored in {getStoredResourceProviderLabel(editingLibraryResource)}.
            To replace it, add a new resource and delete this entry after
            verifying the replacement.
          </p>
        )
      ) : (
        <>
          <div className="library-resource-mode">
            <span>How would you like to add the resource?</span>

            <div className="library-resource-mode-buttons">
              <button
                type="button"
                className={
                  libraryResourceMode === 'upload'
                    ? 'secondary-button active'
                    : 'secondary-button'
                }
                onClick={() => setLibraryResourceMode('upload')}
              >
                Upload a file
              </button>

              <button
                type="button"
                className={
                  libraryResourceMode === 'link'
                    ? 'secondary-button active'
                    : 'secondary-button'
                }
                onClick={() => setLibraryResourceMode('link')}
              >
                Add a sharing link
              </button>
            </div>
          </div>

          {libraryResourceMode === 'upload' ? (
            <label>
              Select a file
              <input
                type="file"
                onChange={(event) =>
                  setLibraryResourceFile(event.target.files?.[0] ?? null)
                }
                required
              />
              <small>
                The selected file will be uploaded to your Google Drive.
                The upload process will attempt to enable link-based viewing.
              </small>
            </label>
          ) : (
            <label>
              Google Drive or OneDrive sharing URL
              <input
                type="url"
                value={libraryResourceForm.external_url}
                onChange={(event) =>
                  setLibraryResourceForm((current) => ({
                    ...current,
                    external_url: event.target.value,
                  }))
                }
                placeholder="https://drive.google.com/..."
                required
              />
              <small>
                Make sure the sharing permissions allow your intended students
                to access the resource.
              </small>
            </label>
          )}
        </>
      )}

      <label className="library-resource-publish-option">
        <input
          type="checkbox"
          checked={libraryResourceForm.is_published}
          onChange={(event) =>
            setLibraryResourceForm((current) => ({
              ...current,
              is_published: event.target.checked,
            }))
          }
        />
        Publish this resource immediately
      </label>

      <div className="library-resource-form-actions">
        <button
        type="submit"
      className="primary-button"
     disabled={libraryResourceSaving || libraryResourceUpdating}
>
      {libraryResourceSaving || libraryResourceUpdating
     ? 'Saving...'
     : editingLibraryResource
      ? 'Save Changes'
      : libraryResourceMode === 'upload'
        ? 'Upload and Save'
        : 'Save Sharing Link'}
    </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            resetLibraryResourceForm()
            setLibraryResourceFormOpen(false)
          }}
          disabled={libraryResourceSaving || libraryResourceUpdating}
        >
          Cancel
        </button>

      </div>
    </form>
  )}

  <div className="library-resource-list">
    {libraryResources.filter((resource) => {
  const search = librarySearch.trim().toLowerCase()

  const matchesSearch =
    !search ||
    [
      resource.title,
      resource.description,
      resource.resource_type,
      resource.file_name,
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(search))

  const matchesType =
    libraryResourceType === 'all' ||
    resource.resource_type === libraryResourceType

  return matchesSearch && matchesType
}).length === 0 ? (
      <div className="library-resource-empty">
        <Icon name="file-text" size={30} />
        <h5>No resources available yet</h5>
        <p>
          {isCommittee
            ? 'Add lecture notes, presentations, past papers, or other learning materials for this module.'
            : 'Study materials for this module will appear here when published.'}
        </p>
      </div>
    ) : (
      libraryResources
        .filter(
          (resource) =>
            libraryResourceType === 'all' ||
            resource.resource_type === libraryResourceType
        )
        .map((resource) => (
          
<article className="library-resource-card" key={resource.id}>
  <div className="library-resource-card-icon">
    <Icon name="file-text" size={22} />
  </div>

  <div className="library-resource-card-content">
    <div className="library-resource-card-heading">
      <h5>{resource.title}</h5>

      {isCommittee && (
        <span
          className={
            resource.is_published
              ? 'library-resource-status published'
              : 'library-resource-status draft'
          }
        >
          {resource.is_published ? 'Published' : 'Draft'}
        </span>
      )}
    </div>

    <p className="library-resource-type">
      {resource.resource_type}
    </p>

    {resource.description && <p>{resource.description}</p>}

    {resource.file_name && (
      <p className="library-resource-filename">
        {resource.file_name}
      </p>
    )}

    {resource.external_url && (
      <a
        className="text-button"
        href={resource.external_url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open resource ↗
      </a>
    )}

    {isCommittee && (
      <div className="library-resource-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => startEditingLibraryResource(resource)}
        >
          <Icon name="pencil" size={14} />
          Edit
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => toggleLibraryResourcePublished(resource)}
        >
          <Icon
            name={resource.is_published ? 'eye-off' : 'eye'}
            size={14}
          />
          {resource.is_published ? 'Unpublish' : 'Publish'}
        </button>

        <button
          type="button"
          className="secondary-button library-resource-delete"
          onClick={() => deleteLibraryResource(resource)}
        >
          <Icon name="trash-2" size={14} />
          Delete
        </button>
      </div>
    )}
  </div>
</article>

        ))
    )}
  </div>
</div>

    <button
      type="button"
      className="text-button"
      onClick={() => setSelectedLibraryModule(null)}
    >
      ← Back to modules
    </button>
  </div>
)}
</div>

<p className="library-demo-note">
  Modules are loaded from the Academic Library database.
</p>
</section>
)}

        
{activePage === 'exams' && (
  <section className="academic-library exam-library">
    <div className="library-heading">
      <div>
        <span className="eyebrow muted">PREPARE WITH CONFIDENCE</span>
        <h1>Exam Paper Library</h1>
        <p>Find past papers by module, semester, and exam year.</p>
      </div>

      {isCommittee && (
        <button
          className="create-button"
          type="button"
          onClick={() => {
            setEditingExamPaper(null)
            setExamForm({
              degree: 'Applied Accounting',
              year_of_study: 1,
              semester: 1,
              module_code: '',
              module_name: '',
              exam_year: new Date().getFullYear(),
              paper_type: 'Final Exam',
              title: '',
              description: '',
              file_url: '',
              is_published: false,
            })
            setExamFormOpen(true)
          }}
        >
          Add exam paper
        </button>
      )}
    </div>

    <div className="exam-library-toolbar">
      <input
        type="search"
        value={examSearch}
        onChange={(event) => setExamSearch(event.target.value)}
        placeholder="Search module code, module name, or paper title"
        aria-label="Search exam papers"
      />

      <select
        value={examDegree}
        onChange={(event) => setExamDegree(event.target.value)}
        aria-label="Filter by degree"
      >
        {examDegrees.map((degree) => (
          <option key={degree} value={degree}>{degree === 'All' ? 'All degrees' : degree}</option>
        ))}
      </select>

      <select
        value={examStudyYear}
        onChange={(event) => setExamStudyYear(event.target.value)}
        aria-label="Filter by year of study"
      >
        <option value="All">All study years</option>
        {[1, 2, 3, 4].map((year) => (
          <option key={year} value={String(year)}>Year {year}</option>
        ))}
      </select>

      <select
        value={examSemester}
        onChange={(event) => setExamSemester(event.target.value)}
        aria-label="Filter by semester"
      >
        <option value="All">All semesters</option>
        {Array.from({ length: 8 }, (_, index) => index + 1).map((semester) => (
          <option key={semester} value={String(semester)}>Semester {semester}</option>
        ))}
      </select>

      <select
        value={examYear}
        onChange={(event) => setExamYear(event.target.value)}
        aria-label="Filter by exam year"
      >
        {examYears.map((year) => (
          <option key={year} value={year}>
            {year === 'All' ? 'All exam years' : year}
          </option>
        ))}
      </select>

      <select
        value={examPaperType}
        onChange={(event) => setExamPaperType(event.target.value)}
        aria-label="Filter by paper type"
      >
        {examPaperTypes.map((type) => (
          <option key={type} value={type}>
            {type === 'All' ? 'All paper types' : type}
          </option>
        ))}
      </select>
    </div>

{isCommittee && examFormOpen && (
  <form
    className="library-resource-form exam-paper-form"
    onSubmit={saveExamPaper}
  >
    <h2>{editingExamPaper ? 'Edit exam paper' : 'Add exam paper'}</h2>

    <label>
      Degree
      <select
        value={examForm.degree}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            degree: event.target.value,
          }))
        }
        required
      >
        <option>Applied Accounting</option>
        <option>Business Analytics</option>
      </select>
    </label>

    <label>
      Year of study
      <select
        value={examForm.year_of_study}
        onChange={(event) => {
          const year = Number(event.target.value)
          setExamForm((current) => ({
            ...current,
            year_of_study: year,
            semester: year * 2 - 1,
          }))
        }}
        required
      >
        {[1, 2, 3, 4].map((year) => (
          <option key={year} value={year}>Year {year}</option>
        ))}
      </select>
    </label>

    <label>
      Semester
      <select
        value={examForm.semester}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            semester: Number(event.target.value),
          }))
        }
        required
      >
        {[1, 2, 3, 4, 5, 6, 7, 8]
          .filter((semester) =>
            [examForm.year_of_study * 2 - 1, examForm.year_of_study * 2]
              .includes(semester)
          )
          .map((semester) => (
            <option key={semester} value={semester}>
              Semester {semester}
            </option>
          ))}
      </select>
    </label>

    <label>
      Module code
      <input
        value={examForm.module_code}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            module_code: event.target.value,
          }))
        }
        required
      />
    </label>

    <label>
      Module name
      <input
        value={examForm.module_name}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            module_name: event.target.value,
          }))
        }
        required
      />
    </label>

    <label>
      Exam year
      <input
        type="number"
        min="2000"
        max="2100"
        value={examForm.exam_year}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            exam_year: event.target.value,
          }))
        }
        required
      />
    </label>

    <label>
      Paper type
      <select
        value={examForm.paper_type}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            paper_type: event.target.value,
          }))
        }
        required
      >
        <option>Final Exam</option>
        <option>Midterm</option>
        <option>Mock Exam</option>
        <option>Other</option>
      </select>
    </label>

    <label>
      Paper title
      <input
        value={examForm.title}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            title: event.target.value,
          }))
        }
        required
      />
    </label>

    <label>
      Description (optional)
      <textarea
        value={examForm.description}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            description: event.target.value,
          }))
        }
        rows={3}
      />
    </label>

    <label>
      Paper URL
      <input
        type="url"
        value={examForm.file_url}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            file_url: event.target.value,
          }))
        }
        placeholder="https://..."
        required
      />
    </label>

    <label>
      <input
        type="checkbox"
        checked={examForm.is_published}
        onChange={(event) =>
          setExamForm((current) => ({
            ...current,
            is_published: event.target.checked,
          }))
        }
      />
      Publish immediately
    </label>

    <div className="library-resource-form-actions">
      <button
        type="submit"
        className="create-button"
        disabled={examsLoading}
      >
        {examsLoading
          ? 'Saving...'
          : editingExamPaper
            ? 'Save changes'
            : 'Save exam paper'}
      </button>

      <button
        type="button"
        onClick={() => {
          setExamFormOpen(false)
          setEditingExamPaper(null)
        }}
      >
        Cancel
      </button>
    </div>
  </form>
)}

    {examsLoading ? (
      <p>Loading exam papers...</p>
    ) : filteredExamPapers.length === 0 ? (
      <div className="page-placeholder exam-empty-state">
        <h2>No exam papers found</h2>
        <p>
          {examPapers.length === 0
            ? 'No papers have been published yet.'
            : 'Try changing your search or filters.'}
        </p>
      </div>
    ) : (
      <div className="exam-paper-grid">
        {filteredExamPapers.map((paper) => (
          <article className="library-resource-card exam-paper-card" key={paper.id}>
            <span className="eyebrow muted">
              {paper.paper_type} · {paper.exam_year}
            </span>
            <h2>{paper.title}</h2>
            <p>{paper.module_code} — {paper.module_name}</p>
            <p>
              {paper.degree} · Year {paper.year_of_study} · Semester {paper.semester}
            </p>
            {paper.description && <p>{paper.description}</p>}

            {isCommittee && (
              <p className="library-resource-status">
                {paper.is_published ? 'Published' : 'Draft'}
              </p>
            )}

            
<div className="library-card-actions">
  <a
    className="create-button"
    href={paper.file_url}
    target="_blank"
    rel="noopener noreferrer"
  >
    View paper
  </a>

  {isCommittee && (
    <>
      <button
        type="button"
        onClick={() => openExamPaperForEdit(paper)}
      >
        Edit
      </button>

      <button
        type="button"
        onClick={() => toggleExamPaperPublished(paper)}
      >
        {paper.is_published ? 'Unpublish' : 'Publish'}
      </button>

      <button
        type="button"
        onClick={() => deleteExamPaper(paper)}
      >
        Delete
      </button>
    </>
  )}
</div>

          </article>
        ))}
      </div>
    )}
  </section>
  
)}

      </main>
      <footer><a className="brand footer-brand" href="#top"><span className="brand-mark">S</span><span className="brand-copy"><strong>SABSA</strong><span>ACADEMIC HUB</span></span></a><span>A shared space for the SAB community.</span><span>© SABSA Students’ Association</span></footer>

      {composerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false) }}><section className="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title"><div className="modal-heading"><div><span className="eyebrow muted">ADD TO THE WALL</span><h2 id="composer-title">Share a thought</h2></div><button className="icon-button" onClick={() => setComposerOpen(false)} aria-label="Close"><Icon name="close"/></button></div><p className="modal-intro">Your post will appear after the Education Committee reviews it.</p><form onSubmit={submitPost} className="composer-form"><fieldset className="identity-choice"><legend>How should this appear on the wall?</legend><div className="identity-options" role="radiogroup" aria-label="Post attribution"><button type="button" role="radio" aria-checked={!form.isAnonymous} className={!form.isAnonymous ? 'is-selected' : ''} onClick={() => setForm((current) => ({ ...current, isAnonymous: false }))}><strong>Post with my name</strong><span>Your name and batch appear publicly.</span></button><button type="button" role="radio" aria-checked={form.isAnonymous} className={form.isAnonymous ? 'is-selected' : ''} onClick={() => setForm((current) => ({ ...current, isAnonymous: true }))}><strong>Post anonymously</strong><span>The wall shows “Anonymous student”.</span></button></div><p>Your name and batch are still shared with the Education Committee for moderation.</p></fieldset><label>Your name<input name="name" value={form.name} onChange={updateForm} maxLength={100} placeholder="How should the committee know you?" required/></label><label>Your batch<input name="batch" value={form.batch} onChange={updateForm} maxLength={50} placeholder="e.g. 2023 / Batch 18" required/></label><label>Your message<textarea name="content" value={form.content} onChange={updateForm} maxLength={10000} rows={5} placeholder="Write something worth sharing..." required/><span className="char-count">{form.content.length}/10,000</span></label><label className="upload-field"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)}/><span className="upload-icon"><Icon name="paperclip" size={19}/></span><span><strong>{file ? file.name : 'Add an attachment'}</strong><small>JPG, PNG, WEBP or PDF · max 5 MB · optional</small></span>{file && <button type="button" className="remove-file" onClick={(event) => { event.preventDefault(); setFile(null) }}>Remove</button>}</label>{error && <p className="inline-error" role="alert">{error}</p>}<div className="form-foot"><span><Icon name="shield" size={16}/> Reviewed before publishing</span><button className="create-button" type="submit" disabled={submitting}>{submitting ? 'Sending...' : 'Send for review'}<span>↗</span></button></div></form></section></div>}

{announcementFormOpen && isCommittee && (
  <div
    className="modal-backdrop"
    role="presentation"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        setAnnouncementFormOpen(false)
      }
    }}
  >
    <section
      className="modal composer-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-form-title"
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow muted">SABSA ACADEMIC HUB</span>
          <h2 id="announcement-form-title">
            {editingAnnouncement ? 'Edit announcement' : 'New announcement'}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => setAnnouncementFormOpen(false)}
          aria-label="Close"
        >
          <Icon name="close" />
        </button>
      </div>

      <form className="composer-form" onSubmit={saveAnnouncement}>
        <label>
          Title
          <input
            type="text"
            required
            maxLength={200}
            value={announcementForm.title}
            onChange={(event) =>
              setAnnouncementForm((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            placeholder="Enter announcement title"
          />
        </label>

        <label>
          Short summary
          <textarea
            rows={2}
            maxLength={500}
            value={announcementForm.summary}
            onChange={(event) =>
              setAnnouncementForm((current) => ({
                ...current,
                summary: event.target.value,
              }))
            }
            placeholder="Briefly describe the announcement"
          />
        </label>

        <label>
          Full announcement
          <textarea
            rows={7}
            required
            value={announcementForm.content}
            onChange={(event) =>
              setAnnouncementForm((current) => ({
                ...current,
                content: event.target.value,
              }))
            }
            placeholder="Enter the full announcement details"
          />
        </label>

        <label>
          Category
          <select
            value={announcementForm.category}
            onChange={(event) =>
              setAnnouncementForm((current) => ({
                ...current,
                category: event.target.value,
              }))
            }
          >
            <option value="Academic">Academic</option>
            <option value="Examinations">Examinations</option>
            <option value="Events">Events</option>
            <option value="Deadlines">Deadlines</option>
            <option value="General">General</option>
          </select>
        </label>

        <label className="announcement-publish-choice">
          <input
            type="checkbox"
            checked={announcementForm.is_published}
            onChange={(event) =>
              setAnnouncementForm((current) => ({
                ...current,
                is_published: event.target.checked,
              }))
            }
          />
          Publish immediately (otherwise save as draft)
        </label>

        <div className="form-foot">
          <span>
            <Icon name="shield" size={16} />
            Committee only
          </span>
          <button
            type="submit"
            className="create-button"
            disabled={announcementSaving}
          >
            {announcementSaving
              ? 'Saving...'
              : announcementForm.is_published
                ? 'Publish announcement'
                : 'Save draft'}
          </button>
        </div>
      </form>
    </section>
  </div>
)}

      {adminOpen && <div className="modal-backdrop admin-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdminOpen(false) }}><section className="modal admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title"><div className="modal-heading"><div><span className="eyebrow muted">EDUCATION COMMITTEE</span><h2 id="admin-title">Review desk</h2></div><button className="icon-button" onClick={() => setAdminOpen(false)} aria-label="Close"><Icon name="close"/></button></div>{error && <div className="notice error-notice">{error}</div>}
{(!session || session.user?.is_anonymous) ? <form className="admin-login" onSubmit={signInCommittee}><p>Sign in with your committee account to review pending posts.</p><label>Email<input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} required autoComplete="username"/></label><label>Password<input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required autoComplete="current-password"/></label><button className="create-button" disabled={adminBusy}>{adminBusy ? 'Signing in...' : 'Sign in'}<span>↗</span></button></form> : !isCommittee ? <div className="admin-empty"><span className="admin-lock"><Icon name="shield" size={25}/></span><h3>Committee access required</h3><p>This account is signed in, but it is not listed as an Education Committee reviewer.</p><button className="text-button" onClick={signOutCommittee}>Sign out and try another account</button></div> : <><div className="admin-toolbar"><span>{pendingPosts.length} awaiting review</span><button className="text-button" onClick={loadPending}>Refresh ↻</button><button className="text-button" onClick={signOutCommittee}><Icon name="logout" size={15}/> Sign out</button></div><div className="pending-list">{pendingPosts.length ? pendingPosts.map((post) => <article className="pending-card" key={post.id}><div className="pending-meta"><div className="avatar avatar-4">{initials(post.name)}</div><div><strong>{post.name}</strong><span>Batch {post.batch} · {relativeDate(post.created_at)}</span>{post.is_anonymous && <small className="anonymous-status">Publishes as Anonymous student</small>}</div><span className={`status-pill ${post.status}`}>{post.status === 'revision_requested' ? 'Revision' : 'Pending'}</span></div><p>{post.content}</p><Attachment path={post.attachment_path} signedUrl={signedFiles[post.attachment_path]} error={attachmentErrors[post.attachment_path]}/><label className="feedback-label">Feedback (optional)<textarea rows={2} value={decisionFeedback[post.id] || ''} onChange={(event) => setDecisionFeedback((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Add a note for the student..."/></label><div className="review-actions"><button onClick={() => reviewPost(post.id, 'rejected')} disabled={adminBusy} className="reject-button">Reject</button><button onClick={() => reviewPost(post.id, 'revision_requested')} disabled={adminBusy} className="revision-button">Request revision</button><button onClick={() => reviewPost(post.id, 'approved')} disabled={adminBusy} className="approve-button">Approve</button></div></article>) : <div className="admin-empty"><span className="empty-spark">✳</span><h3>All caught up.</h3><p>New submissions will show up here.</p></div>}</div></>}</section></div>}
    </div>
  )
}

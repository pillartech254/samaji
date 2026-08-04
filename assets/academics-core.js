// ============================================================
//  Shared CBC academics engine — the SAME code the Teacher Portal
//  and School (admin) Portal both call, so "marks a teacher enters"
//  and "report cards an admin pulls" are provably one system, not
//  two that happen to agree. Pure data functions, no DOM.
//
//  Model: mark_sheets = one class+subject+term+year assessment slot.
//  exams = one row per assessment type inside a mark sheet (this is
//  the "exam announcement" — created by admin only, see RLS). A
//  report card is a single-term grid: rows are subjects, columns are
//  the term's exams (assessment types that contribute to the final
//  score, in `sort` order) — one EE/ME/AE/BE competency band per cell.
// ============================================================
(function () {
  // The KICD summative report card has exactly three fixed test columns
  // (First/Second/Third Test) — a school can configure as many contributing
  // assessment types as it likes, but only the first 3 (by `sort`) ever
  // become report-card columns. Also enforced in the Exam Announcements
  // screen and in the database (setup-modules-32.sql).
  var MAX_TESTS = 3;

  function classLabel(c){ if(!c) return "—"; return c.level + (c.stream ? " "+c.stream : ""); }

  // Common bootstrap both portals need before they can render anything
  // academics-related: academic years/terms, assessment types, grading
  // schemes+bands, and a teacher id -> name lookup.
  async function loadAcademicContext(sb, schoolId){
    var ayRes = await sb.from("academic_years").select("*, terms(*)").eq("school_id",schoolId).order("year",{ascending:false});
    var years = ayRes.data||[];
    years.forEach(function(y){ y.terms = (y.terms||[]).slice().sort(function(a,b){ return a.sort-b.sort; }); });

    var atRes = await sb.from("assessment_types").select("*").eq("school_id",schoolId).order("name");
    var allTypes = atRes.data||[];

    var schemeRes = await sb.from("grading_schemes").select("*, grading_levels(*)").eq("school_id",schoolId);
    var schemes = schemeRes.data||[];

    var teachersRes = await sb.from("teachers").select("id,name").eq("school_id",schoolId);
    var teacherNameById = {}; (teachersRes.data||[]).forEach(function(t){ teacherNameById[t.id]=t.name; });

    var defaultYear = years.find(function(y){ return y.status==="active"; }) || years[0];
    var defaultTerm = defaultYear ? (defaultYear.terms.find(function(t){ return t.status==="active"; }) || defaultYear.terms[defaultYear.terms.length-1]) : null;

    return { years:years, allTypes:allTypes, schemes:schemes, teacherNameById:teacherNameById, defaultYear:defaultYear, defaultTerm:defaultTerm };
  }

  // Shared by the Teacher Portal's Report Books preview, the "Generate
  // Report Cards" freeze action, and the School Portal's Report Cards
  // console, so all three compute grades exactly the same way.
  // onlyPublished=true restricts to mark sheets a Principal/Deputy (or
  // an admin) has actually published — used when freezing an official
  // snapshot.
  async function fetchClassReportData(sb, schoolId, cls, year, term, allTypes, schemes, onlyPublished){
    var csr = await sb.from("class_subjects").select("subjects(id,name)").eq("class_id",cls.id);
    var subjects = (csr.data||[]).map(function(x){ return x.subjects; }).filter(Boolean).sort(function(a,b){ return a.name<b.name?-1:1; });

    var sr = await sb.from("students").select("id,first_name,last_name,admission_no,upi,photo_url").eq("school_id",schoolId).eq("class_id",cls.id).eq("status","active").order("first_name");
    var students = sr.data||[];
    var studentIds = students.map(function(s){ return s.id; });

    var types = window.SamajiGrading.typesForGrade(allTypes, cls.level).filter(function(t){ return t.contributes_to_final; })
      .slice().sort(function(a,b){ return (a.sort||0)-(b.sort||0) || (a.name<b.name?-1:1); }).slice(0, MAX_TESTS);
    var scheme = window.SamajiGrading.schemeForGrade(schemes, cls.level);
    var levels = scheme ? (scheme.grading_levels||[]) : [];

    var msQ = sb.from("mark_sheets").select("id,subject_id").eq("class_id",cls.id).eq("term_id",term.id).eq("academic_year_id",year.id);
    if (onlyPublished) msQ = msQ.eq("status","published");
    var msRes = await msQ;
    var markSheets = msRes.data||[];
    var msBySubject = {}; markSheets.forEach(function(m){ msBySubject[m.subject_id]=m.id; });
    var msIds = markSheets.map(function(m){ return m.id; });

    var examsByMs = {};
    if (msIds.length){
      var exRes = await sb.from("exams").select("id,mark_sheet_id,assessment_type_id,max_score").in("mark_sheet_id",msIds);
      (exRes.data||[]).forEach(function(e){ (examsByMs[e.mark_sheet_id]=examsByMs[e.mark_sheet_id]||[]).push(e); });
    }
    var resultsByExam = {};
    var allExamIds = [];
    Object.keys(examsByMs).forEach(function(k){ examsByMs[k].forEach(function(e){ allExamIds.push(e.id); }); });
    if (allExamIds.length && studentIds.length){
      var resRes = await sb.from("exam_results").select("exam_id,student_id,score").in("exam_id",allExamIds).in("student_id",studentIds);
      (resRes.data||[]).forEach(function(r){ (resultsByExam[r.exam_id]=resultsByExam[r.exam_id]||{})[r.student_id]=r.score; });
    }
    // One student's percentage on one subject's one test, or null if not recorded.
    // Uses the exam's OWN max_score (set by the teacher when marking that
    // specific test) rather than the assessment type's default max_marks —
    // the same test slot can be marked out of a different total each term.
    function percentFor(subjectId, typeId, studentId){
      var msId = msBySubject[subjectId];
      if (!msId) return null;
      var exam = (examsByMs[msId]||[]).find(function(e){ return e.assessment_type_id===typeId; });
      if (!exam) return null;
      var score = (resultsByExam[exam.id]||{})[studentId];
      if (score==null) return null;
      if (exam.max_score) return Math.round((Number(score)/Number(exam.max_score))*1000)/10;
      var type = allTypes.find(function(t){ return t.id===typeId; });
      var max = type ? (Number(type.max_marks)||100) : 100;
      return Math.round((Number(score)/max)*1000)/10;
    }

    var ratingsByStudent = {};
    if (studentIds.length){
      var ratingsRes = await sb.from("learner_ratings").select("student_id,category,item_name,level_code").in("student_id",studentIds).eq("term_id",term.id).eq("academic_year_id",year.id);
      (ratingsRes.data||[]).forEach(function(r){
        ratingsByStudent[r.student_id] = ratingsByStudent[r.student_id] || { competency:{}, value:{}, psychomotor:{} };
        ratingsByStudent[r.student_id][r.category][r.item_name] = r.level_code;
      });
    }
    var remarksByStudent = {};
    if (studentIds.length){
      var remarksRes = await sb.from("report_remarks").select("student_id,teacher_remark,principal_remark,promotion_status").in("student_id",studentIds).eq("term_id",term.id).eq("academic_year_id",year.id);
      (remarksRes.data||[]).forEach(function(r){ remarksByStudent[r.student_id]=r; });
    }
    var attByStudent = {};
    if (studentIds.length){
      var attQ = sb.from("attendance").select("student_id,status,on_date").eq("school_id",schoolId).in("student_id",studentIds);
      if (term.start_date) attQ = attQ.gte("on_date",term.start_date);
      if (term.end_date) attQ = attQ.lte("on_date",term.end_date);
      var attRes = await attQ;
      (attRes.data||[]).forEach(function(a){
        attByStudent[a.student_id] = attByStudent[a.student_id] || { daysOpen:0, daysPresent:0, daysAbsent:0 };
        attByStudent[a.student_id].daysOpen++;
        if (a.status==="present") attByStudent[a.student_id].daysPresent++;
        else if (a.status==="absent") attByStudent[a.student_id].daysAbsent++;
      });
    }

    return { cls:cls, year:year, term:term, subjects:subjects, students:students, types:types, scheme:scheme, levels:levels,
      percentFor:percentFor, ratingsByStudent:ratingsByStudent, remarksByStudent:remarksByStudent, attByStudent:attByStudent };
  }

  // Pure: turns one student's per-test scores into the subjectRows shape
  // assets/report-card.js expects — one row per subject, one EE/ME/AE/BE
  // competency code per test (also used to build a frozen snapshot).
  function computeSubjectRows(data, studentId){
    return data.subjects.map(function(sub){
      var tests = data.types.map(function(t){
        var pct = data.percentFor(sub.id, t.id, studentId);
        if (pct==null) return null;
        var lvl = window.SamajiGrading.levelFor(data.levels, pct);
        return lvl ? lvl.competency_code : null;
      });
      return { name:sub.name, tests:tests };
    });
  }
  // Quick on-screen indicator (not printed): one subject's mean % across
  // whichever tests it actually has scores for.
  function subjectAvgPercent(data, sub, studentId){
    var vals = data.types.map(function(t){ return data.percentFor(sub.id, t.id, studentId); }).filter(function(v){ return v!=null; });
    return vals.length ? Math.round((vals.reduce(function(a,b){ return a+b; },0)/vals.length)*10)/10 : null;
  }
  // The report card's "Total Percentage" / "Average Score" footer rows:
  // per test, the mean % across all subjects that have a score for it,
  // banded into the matching EE/ME/AE/BE checkmark.
  function testSummaryFor(data, studentId){
    var totalPercentPerTest = [], averageCodePerTest = [];
    data.types.forEach(function(t){
      var vals = data.subjects.map(function(sub){ return data.percentFor(sub.id, t.id, studentId); }).filter(function(v){ return v!=null; });
      if (!vals.length){ totalPercentPerTest.push(null); averageCodePerTest.push(null); return; }
      var avg = Math.round((vals.reduce(function(a,b){ return a+b; },0)/vals.length)*10)/10;
      var lvl = window.SamajiGrading.levelFor(data.levels, avg);
      totalPercentPerTest.push(avg);
      averageCodePerTest.push(lvl ? lvl.competency_code : null);
    });
    return { totalPercentPerTest:totalPercentPerTest, averageCodePerTest:averageCodePerTest };
  }
  function overallFromSummary(summary){
    var vals = (summary.totalPercentPerTest||[]).filter(function(v){ return v!=null; });
    return vals.length ? Math.round((vals.reduce(function(a,b){ return a+b; },0)/vals.length)*10)/10 : null;
  }

  // Freezes one class+term's report cards from currently-published mark
  // sheets into `report_cards`. Shared by the Teacher Portal's Publish
  // Results screen and the School Portal's Report Cards console —
  // whichever one runs it, the snapshot is built identically.
  // publishedByTeacherId may be null (an admin has no teachers row).
  async function generateReportCards(sb, schoolId, cls, year, term, allTypes, schemes, teacherNameById, publishedByTeacherId){
    var data = await fetchClassReportData(sb, schoolId, cls, year, term, allTypes, schemes, true);
    if (!data.students.length) return { count:0 };
    var rows = data.students.map(function(s){
      var subjectRows = computeSubjectRows(data, s.id);
      var summary = testSummaryFor(data, s.id);
      var remark = data.remarksByStudent[s.id]||{};
      return { school_id:schoolId, student_id:s.id, class_id:cls.id, term_id:term.id, academic_year_id:year.id,
        class_label: classLabel(cls), class_teacher_name: teacherNameById[cls.class_teacher_id]||null,
        subject_rows: { subjects:subjectRows, totalPercentPerTest:summary.totalPercentPerTest, averageCodePerTest:summary.averageCodePerTest,
          classLevel:cls.level, classStream:cls.stream||null },
        attendance: data.attByStudent[s.id]||null, ratings: data.ratingsByStudent[s.id]||null,
        overall_average: overallFromSummary(summary), teacher_remark: remark.teacher_remark||null, principal_remark: remark.principal_remark||null,
        promotion_status: remark.promotion_status||null,
        published_at: new Date().toISOString(), published_by: publishedByTeacherId||null };
    });
    var res = await sb.from("report_cards").upsert(rows, { onConflict:"student_id,term_id,academic_year_id" });
    if (res.error) return { count:0, error:res.error };
    return { count:rows.length };
  }

  // Builds the exact opts object assets/report-card.js's studentReportHTML
  // expects, from live (not-yet-frozen) marks. Shared by both portals so a
  // live preview looks identical whether opened from the Teacher Portal or
  // the School Portal's Report Cards console.
  function buildLiveReportOpts(school, student, cls, term, academicYear, data, facilitatorName, facilitatorRemark){
    var summary = testSummaryFor(data, student.id);
    var remark = (data.remarksByStudent||{})[student.id]||{};
    return { school:school, student:student, cls:cls, term:term, academicYear:academicYear,
      facilitatorName: facilitatorName||"—", facilitatorRemark: facilitatorRemark||"",
      subjectRows: computeSubjectRows(data, student.id), levels: data.levels,
      totalPercentPerTest: summary.totalPercentPerTest, averageCodePerTest: summary.averageCodePerTest,
      attendance: (data.attByStudent||{})[student.id]||null, promotionStatus: remark.promotion_status||null,
      published:false };
  }
  // Same, but from a frozen `report_cards` row — a reprint always matches
  // what was originally issued even if marks changed afterwards. Only a
  // frozen row carries a verification_code (a draft/live preview isn't an
  // official document, so it prints without a verification QR).
  function buildSnapshotReportOpts(school, student, snapshotRow, cls, term, academicYear, levels){
    var sr = snapshotRow.subject_rows||{};
    return { school:school, student:student,
      cls: { level: sr.classLevel || (cls&&cls.level), stream: sr.classStream || (cls&&cls.stream) },
      term:term, academicYear:academicYear,
      facilitatorName: snapshotRow.class_teacher_name||"—", facilitatorRemark: snapshotRow.teacher_remark||"",
      subjectRows: sr.subjects||[], levels:levels,
      totalPercentPerTest: sr.totalPercentPerTest||[], averageCodePerTest: sr.averageCodePerTest||[],
      attendance: snapshotRow.attendance||null, promotionStatus: snapshotRow.promotion_status||null,
      verificationCode: snapshotRow.verification_code||null,
      published:true, publishedAt:snapshotRow.published_at };
  }

  window.SamajiAcademics = {
    MAX_TESTS: MAX_TESTS,
    classLabel: classLabel,
    loadAcademicContext: loadAcademicContext,
    fetchClassReportData: fetchClassReportData,
    computeSubjectRows: computeSubjectRows,
    subjectAvgPercent: subjectAvgPercent,
    testSummaryFor: testSummaryFor,
    overallFromSummary: overallFromSummary,
    generateReportCards: generateReportCards,
    buildLiveReportOpts: buildLiveReportOpts,
    buildSnapshotReportOpts: buildSnapshotReportOpts
  };
})();

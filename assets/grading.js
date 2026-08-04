// ============================================================
//  Shared CBC grading/calculation engine — pure functions, no DOM.
//  Used by the Teacher Portal's Marks & Grading screen (Phase 2)
//  and, later, report card generation and dashboards, so the exact
//  same weighting/rounding logic runs everywhere a score is shown.
// ============================================================
(function () {
  // scores: [{ assessment_type_id, score, maxScore }]  — one entry per
  // assessment type that actually has a value for this student (blanks are
  // simply omitted). maxScore is optional — the actual "out of" marks for
  // THIS specific exam instance (a teacher can set this per test, since the
  // same assessment type may be marked out of a different total each term);
  // falls back to the assessment type's configured max_marks when absent.
  // types: the assessment_types rows those ids refer to (max_marks, weight_percent, contributes_to_final).
  // Weight is prorated across whichever contributing types are actually
  // present, so a partially-filled mark sheet still shows a sensible
  // "average so far" instead of demanding every column be filled first.
  function weightedTotal(scores, types) {
    var byId = {}; types.forEach(function (t) { byId[t.id] = t; });
    var weightSum = 0, weightedSum = 0, anyCounted = false;
    scores.forEach(function (s) {
      var t = byId[s.assessment_type_id];
      if (!t || !t.contributes_to_final || s.score == null || s.score === "") return;
      var max = s.maxScore != null && s.maxScore !== "" ? Number(s.maxScore) : (Number(t.max_marks) || 100);
      var pct = (Number(s.score) / (max || 100)) * 100;
      var w = Number(t.weight_percent) || 0;
      weightedSum += pct * w;
      weightSum += w;
      anyCounted = true;
    });
    if (!anyCounted || weightSum <= 0) return null;
    return Math.round((weightedSum / weightSum) * 10) / 10; // one decimal place
  }

  // levels: grading_levels rows for one scheme (min_score, max_score, grade_label,
  // competency_code, competency_label, remark, color).
  function levelFor(levels, score) {
    if (score == null) return null;
    var match = (levels || []).find(function (l) { return score >= l.min_score && score <= l.max_score; });
    return match || null;
  }

  // Picks the grading scheme that applies to a given class level, falling
  // back to the school's default scheme, then to the first scheme at all.
  function schemeForGrade(schemes, gradeLevel) {
    if (!schemes || !schemes.length) return null;
    var specific = schemes.find(function (s) { return s.applicable_grades && s.applicable_grades.length && s.applicable_grades.indexOf(gradeLevel) >= 0; });
    if (specific) return specific;
    return schemes.find(function (s) { return s.is_default; }) || schemes[0];
  }

  // Same idea for assessment types: only the ones configured for this
  // class's grade level (or configured for "all grades") apply.
  function typesForGrade(types, gradeLevel) {
    return (types || []).filter(function (t) {
      return !t.applicable_grades || !t.applicable_grades.length || t.applicable_grades.indexOf(gradeLevel) >= 0;
    });
  }

  window.SamajiGrading = {
    weightedTotal: weightedTotal,
    levelFor: levelFor,
    schemeForGrade: schemeForGrade,
    typesForGrade: typesForGrade
  };
})();
